/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PAGE_MANAGE_PAYMENTS = "about:preferences#managePayments";

const LIST = "#setting-control-payments-list";
const SELECTORS = {
  records: `${LIST} .setting-list-item`,
  empty: `${LIST} .setting-list-empty`,
  delete: `${LIST} .setting-list-action[data-action="remove"]`,
};

async function withManagePaymentsPage(taskFn) {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PAYMENTS },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const page = await ContentTaskUtils.waitForCondition(
          () =>
            content.document.querySelector(
              '[data-category="paneManagePayments"]'
            ),
          "Manage payment methods pane exists"
        );
        await ContentTaskUtils.waitForCondition(
          () => !page.hidden,
          "Manage payment methods pane did not become visible"
        );
      });

      await taskFn(browser);
    }
  );
}

/**
 * @param {object} browser
 * @returns {Promise<Map<string, string>>} Each row's expiry, keyed by the last
 *   four digits of its card number.
 */
async function getExpiryByCardSuffix(browser) {
  let l10nArgs = await SpecialPowers.spawn(
    browser,
    [SELECTORS],
    async selectors => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector(selectors.records),
        "The list rendered at least one payment method"
      );
      return [...content.document.querySelectorAll(selectors.records)].map(
        row => row.dataset.l10nArgs
      );
    }
  );
  return new Map(
    l10nArgs.map(args => {
      let { cardNumber, expDate } = JSON.parse(args);
      return [cardNumber.slice(-4), expDate];
    })
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.settings-redesign.enabled", true],
      ["extensions.formautofill.creditCards.enabled", true],
    ],
  });

  await removeAllRecords();
});

add_task(async function test_managePayments_empty_state() {
  await withManagePaymentsPage(async browser => {
    await SpecialPowers.spawn(browser, [SELECTORS], async selectors => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector(selectors.empty),
        "Empty-state 'No payment methods added' item rendered"
      );
      is(
        content.document.querySelectorAll(selectors.records).length,
        0,
        "No payment method rows in the empty state"
      );
    });
  });
});

/**
 * Regression test for bug 2048383: a card saved without an expiry has its empty
 * "cc-exp" stripped by getAll()'s _cloneAndCleanUp(), so an unguarded read of
 * it threw and left the whole list empty.
 */
add_task(async function test_card_without_expiry_is_listed() {
  await setStorage(TEST_CREDIT_CARD_2, TEST_CREDIT_CARD_4);

  await withManagePaymentsPage(async browser => {
    await SpecialPowers.spawn(browser, [SELECTORS], async selectors => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelectorAll(selectors.records).length == 2,
        "Both saved cards are listed"
      );
    });

    let expiryBySuffix = await getExpiryByCardSuffix(browser);
    is(
      expiryBySuffix.get("5100"),
      "",
      "The card without an expiry renders an empty expiry"
    );
    is(
      expiryBySuffix.get("1045"),
      `${TEST_CREDIT_CARD_2["cc-exp-month"]}/${TEST_CREDIT_CARD_2["cc-exp-year"]}`,
      "The card with an expiry renders its formatted expiry"
    );
  });

  await removeAllRecords();
});

add_task(async function test_remove_payment_method_through_UI() {
  await setStorage(TEST_CREDIT_CARD_2);

  await withManagePaymentsPage(async browser => {
    let confirmed = BrowserTestUtils.promiseAlertDialog("accept");

    await SpecialPowers.spawn(browser, [SELECTORS], async selectors => {
      let button = await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector(selectors.delete),
        "Remove button for the stored card"
      );
      button.click();
    });

    await confirmed;

    let creditCards = await getCreditCards();
    is(creditCards.length, 0, "The card was removed from storage");

    await SpecialPowers.spawn(browser, [SELECTORS], async selectors => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector(selectors.empty),
        "The list falls back to its empty state after the removal"
      );
    });
  });
});
