/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const LIST = "#setting-control-permissionsLocation-list";
const REMOVE_ALL = "#setting-control-permissionsLocation-remove-all moz-button";
const BLOCK_NEW = "#setting-control-permissionsLocation-block-new moz-checkbox";
const DEFAULT_PREF = "permissions.default.geo";
const AUTOPLAY_DEFAULT =
  "#setting-control-permissionsAutoplay-default moz-select";
const AUTOPLAY_PREF = "media.autoplay.default";

const ORIGINS = ["https://example.com", "https://mozilla.org"];

/**
 * @param {string} origin
 * @returns {nsIPrincipal}
 */
function principalFor(origin) {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    origin
  );
}

function setPermissions() {
  SitePermissions.setForPrincipal(
    principalFor(ORIGINS[0]),
    "geo",
    SitePermissions.ALLOW
  );
  SitePermissions.setForPrincipal(
    principalFor(ORIGINS[1]),
    "geo",
    SitePermissions.BLOCK
  );
}

function clearPermissions() {
  for (let origin of ORIGINS) {
    SitePermissions.removeFromPrincipal(principalFor(origin), "geo");
  }
}

/**
 * @param {Document} doc
 * @returns {Element[]}
 */
function rows(doc) {
  return [...doc.querySelectorAll(`${LIST} .setting-list-item`)];
}

/**
 * The rows are rendered once the setting's async read resolves, and again
 * whenever the permissions change underneath it.
 *
 * @param {Document} doc
 * @param {string[]} origins
 * @param {string} message
 */
async function waitForRows(doc, origins, message) {
  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () =>
      rows(doc)
        .map(row => row.dataset.key)
        .join() == origins.join(),
    message
  );
  Assert.deepEqual(
    rows(doc).map(row => row.dataset.key),
    origins,
    message
  );
}

add_setup(async function () {
  registerCleanupFunction(() => {
    clearPermissions();
    Services.prefs.clearUserPref(DEFAULT_PREF);
  });
});

add_task(async function test_lists_the_sites_holding_the_permission() {
  setPermissions();
  let tab = await openPrefsTab("permissionsLocation");
  let doc = tab.linkedBrowser.contentDocument;

  await waitForRows(doc, ORIGINS, "Each site is a row, sorted by origin");

  let [allowed, blocked] = rows(doc);
  is(
    allowed.getAttribute("label"),
    ORIGINS[0],
    "The row is labelled with the origin"
  );
  is(
    allowed.querySelector("moz-select").value,
    String(SitePermissions.ALLOW),
    "The dropdown shows what the site is allowed to do"
  );
  is(
    blocked.querySelector("moz-select").value,
    String(SitePermissions.BLOCK),
    "A blocked site shows as blocked"
  );
  ok(
    allowed.querySelector('.setting-list-action[data-action="remove"]'),
    "Each row can be removed"
  );

  BrowserTestUtils.removeTab(tab);
  clearPermissions();
});

add_task(async function test_the_dropdown_writes_the_permission() {
  setPermissions();
  let tab = await openPrefsTab("permissionsLocation");
  let doc = tab.linkedBrowser.contentDocument;
  await waitForRows(doc, ORIGINS, "Both sites are listed");

  // Unlike the dialog this replaces, there is nothing to accept: the change
  // applies as soon as it is made.
  let select = rows(doc)[0].querySelector("moz-select");
  select.value = String(SitePermissions.BLOCK);
  select.dispatchEvent(new Event("change", { bubbles: true }));

  await TestUtils.waitForCondition(
    () =>
      SitePermissions.getForPrincipal(principalFor(ORIGINS[0]), "geo").state ==
      SitePermissions.BLOCK,
    "The permission was changed"
  );

  BrowserTestUtils.removeTab(tab);
  clearPermissions();
});

add_task(async function test_removing_sites() {
  setPermissions();
  let tab = await openPrefsTab("permissionsLocation");
  let doc = tab.linkedBrowser.contentDocument;
  await waitForRows(doc, ORIGINS, "Both sites are listed");

  synthesizeClick(
    rows(doc)[0].querySelector('.setting-list-action[data-action="remove"]')
  );
  await waitForRows(doc, [ORIGINS[1]], "The removed row is gone");
  is(
    SitePermissions.getForPrincipal(principalFor(ORIGINS[0]), "geo").state,
    SitePermissions.UNKNOWN,
    "The permission was removed"
  );

  synthesizeClick(doc.querySelector(REMOVE_ALL));
  await waitForRows(doc, [], "Removing all leaves no rows");
  ok(
    doc.querySelector(`${LIST} .setting-list-empty`),
    "The empty state took their place"
  );
  await TestUtils.waitForCondition(
    () => doc.querySelector(REMOVE_ALL).disabled,
    "There is nothing left to remove, so the button is disabled"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_blocking_new_requests() {
  let tab = await openPrefsTab("permissionsLocation");
  let doc = tab.linkedBrowser.contentDocument;

  let checkbox = await TestUtils.waitForCondition(
    () => doc.querySelector(BLOCK_NEW),
    "The block new requests checkbox rendered"
  );
  ok(!checkbox.checked, "New requests are allowed to start with");

  synthesizeClick(checkbox);
  await TestUtils.waitForCondition(
    () => Services.prefs.getIntPref(DEFAULT_PREF) == SitePermissions.BLOCK,
    "Checking the box blocks new requests"
  );

  synthesizeClick(checkbox);
  await TestUtils.waitForCondition(
    () => Services.prefs.getIntPref(DEFAULT_PREF) == SitePermissions.UNKNOWN,
    "Unchecking it puts the permission back to asking"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_the_autoplay_default_for_all_websites() {
  // Autoplay's default isn't on or off, so its pane offers the same
  // capabilities the rows do instead of a block new requests checkbox.
  let originalDefault = Services.prefs.getIntPref(AUTOPLAY_PREF);
  let tab = await openPrefsTab("permissionsAutoplay");
  let doc = tab.linkedBrowser.contentDocument;

  let select = await TestUtils.waitForCondition(
    () => doc.querySelector(AUTOPLAY_DEFAULT),
    "The default for all websites rendered"
  );
  is(
    select.value,
    String(SitePermissions.getDefault("autoplay-media")),
    "It shows the current default"
  );
  ok(
    !doc.querySelector("#setting-control-permissionsAutoplay-block-new"),
    "There is no block new requests checkbox to go with it"
  );

  await changeMozSelectValue(
    select,
    String(SitePermissions.AUTOPLAY_BLOCKED_ALL)
  );
  await TestUtils.waitForCondition(
    () =>
      SitePermissions.getDefault("autoplay-media") ==
      SitePermissions.AUTOPLAY_BLOCKED_ALL,
    "Choosing a default applies it"
  );

  Services.prefs.setIntPref(AUTOPLAY_PREF, originalDefault);
  BrowserTestUtils.removeTab(tab);
});
