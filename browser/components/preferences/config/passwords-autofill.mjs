/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gSubDialog, LoginHelper */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

const XPCOMUtils = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
).XPCOMUtils;

const FormAutofill = ChromeUtils.importESModule(
  "resource://autofill/FormAutofill.sys.mjs"
).FormAutofill;

const FormAutofillUtils = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
).FormAutofillUtils;

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const lazy = XPCOMUtils.declareLazy({
  AppConstants: "resource://gre/modules/AppConstants.sys.mjs",
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
  LoginHelper: "resource://gre/modules/LoginHelper.sys.mjs",
  FormAutofillPreferences:
    "resource://autofill/FormAutofillPreferences.sys.mjs",
  formAutofillStorage: "resource://autofill/FormAutofillStorage.sys.mjs",
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "AboutLoginsL10n", () => {
  return new Localization(["branding/brand.ftl", "browser/aboutLogins.ftl"]);
});

export class PasswordSettingHelpers {
  /**
   * Displays a dialog in which the user can view and modify the list of sites
   * where passwords are never saved.
   */
  static showPasswordExceptions() {
    let params = {
      blockVisible: true,
      sessionVisible: false,
      allowVisible: false,
      hideStatusColumn: true,
      prefilledHost: "",
      permissionType: "login-saving",
    };
    gSubDialog.open(
      "chrome://browser/content/preferences/dialogs/permissions.xhtml",
      undefined,
      params
    );
  }

  /**
   * Shows the sites where the user has saved passwords and the associated login
   * information.
   */
  static showPasswords() {
    let loginManager = window.windowGlobalChild.getActor("LoginManager");
    loginManager.sendAsyncMessage("PasswordManager:OpenPreferences", {
      entryPoint: "Preferences",
    });
  }

  /**
   * Displays a dialog in which the primary password may be changed.
   */
  static async changeMasterPassword() {
    // Require OS authentication before the user can set a Primary Password.
    // OS reauthenticate functionality is not available on Linux yet (bug 1527745)
    if (!LoginHelper.isPrimaryPasswordSet() && LoginHelper.getOSAuthEnabled()) {
      // Uses primary-password-os-auth-dialog-message-win and
      // primary-password-os-auth-dialog-message-macosx via concatenation:
      let messageId =
        "primary-password-os-auth-dialog-message-" + lazy.AppConstants.platform;
      let [messageText, captionText] = await document.l10n.formatMessages([
        { id: messageId },
        { id: "master-password-os-auth-dialog-caption" },
      ]);
      let win = Services.wm.getMostRecentBrowserWindow();

      // Note on Glean collection: because OSKeyStore.ensureLoggedIn() is not wrapped in
      // verifyOSAuth(), it will be documenting "success" for unsupported platforms
      // and won't record "fail_error", only "fail_user_canceled"
      let loggedIn = await lazy.OSKeyStore.ensureLoggedIn(
        messageText.value,
        captionText.value,
        win,
        false
      );
      const result = loggedIn.authenticated ? "success" : "fail_user_canceled";
      Glean.pwmgr.promptShownOsReauth.record({
        trigger: "toggle_pref_primary_password",
        result,
      });
      if (!loggedIn.authenticated) {
        return;
      }
    }
    gSubDialog.open("chrome://mozapps/content/preferences/changemp.xhtml", {
      features: "resizable=no",
      closingCallback: () => {
        Services.obs.notifyObservers(null, "passwordmgr-primary-pw-changed");
        PasswordSettingHelpers._initMasterPasswordUI();
      },
    });
  }

  /**
   * Displays the "remove master password" dialog to allow the user to remove
   * the current master password.  When the dialog is dismissed, master password
   * UI is automatically updated.
   */
  static async _removeMasterPassword() {
    const fipsUtils = Cc["@mozilla.org/security/fipsutils;1"].getService(
      Ci.nsIFIPSUtils
    );
    if (fipsUtils.isFIPSEnabled) {
      let title = document.getElementById("fips-title").textContent;
      let desc = document.getElementById("fips-desc").textContent;
      Services.prompt.alert(window, title, desc);
      PasswordSettingHelpers._initMasterPasswordUI();
    } else {
      gSubDialog.open("chrome://mozapps/content/preferences/removemp.xhtml", {
        closingCallback: () => {
          Services.obs.notifyObservers(null, "passwordmgr-primary-pw-changed");
          PasswordSettingHelpers._initMasterPasswordUI();
        },
      });
    }
  }

  /**
   * Initializes master password UI: the "use master password" checkbox, selects
   * the master password button to show, and enables/disables it as necessary.
   * The master password is controlled by various bits of NSS functionality, so
   * the UI for it can't be controlled by the normal preference bindings.
   */
  static _initMasterPasswordUI() {
    var noMP = !LoginHelper.isPrimaryPasswordSet();

    // Check if settings-redesign is enabled to determine which UI is active
    const srdEnabled = Services.prefs.getBoolPref(
      "browser.settings-redesign.enabled",
      false
    );

    const buttonId = srdEnabled
      ? "changePrimaryPassword"
      : "changeMasterPassword";
    const checkboxId = srdEnabled ? "usePrimaryPassword" : "useMasterPassword";

    var button = document.getElementById(buttonId);
    if (button) {
      button.disabled = noMP;
    }

    var checkbox = document.getElementById(checkboxId);
    if (checkbox) {
      checkbox.checked = !noMP;
      checkbox.disabled =
        (noMP && !Services.policies.isAllowed("createMasterPassword")) ||
        (!noMP && !Services.policies.isAllowed("removeMasterPassword"));
    }
  }
}

const MANAGE_ADDRESSES_URL =
  "chrome://formautofill/content/manageAddresses.xhtml";
const MANAGE_CREDITCARDS_URL =
  "chrome://formautofill/content/manageCreditCards.xhtml";
const {
  MANAGE_ADDRESSES_L10N_IDS,
  EDIT_ADDRESS_L10N_IDS,
  MANAGE_CREDITCARDS_L10N_IDS,
  EDIT_CREDITCARD_L10N_IDS,
} = FormAutofillUtils;

const { ENABLED_AUTOFILL_ADDRESSES_PREF, ENABLED_AUTOFILL_CREDITCARDS_PREF } =
  FormAutofill;

const FORM_AUTOFILL_CONFIG = {
  payments: {
    l10nId: "payments-group",
    iconSrc: "chrome://browser/skin/payment-methods-16.svg",
    headingLevel: 2,
    subcategory: "payment-methods-autofill credit-card-autofill",
    items: [
      {
        id: "saveAndFillPayments",
        l10nId: "autofill-payment-methods-checkbox-message-2",
        supportPage: "credit-card-autofill",
        items: [
          {
            id: "requireOSAuthForPayments",
            l10nId: "autofill-reauth-payment-methods-checkbox-2",
            supportPage:
              "credit-card-autofill#w_require-authentication-for-autofill",
          },
        ],
      },
      {
        id: "savedPaymentsButton",
        loadPane: "managePayments",
        l10nId: "autofill-payment-methods-manage-payments-button",
        control: "moz-box-button",
        controlAttrs: {
          "search-l10n-ids": MANAGE_CREDITCARDS_L10N_IDS.concat(
            EDIT_CREDITCARD_L10N_IDS
          ).join(","),
        },
      },
    ],
  },
  addresses: {
    l10nId: "addresses-group",
    iconSrc: "chrome://browser/skin/notification-icons/geo.svg",
    headingLevel: 2,
    subcategory: "addresses-autofill address-autofill",
    items: [
      {
        id: "saveAndFillAddresses",
        l10nId: "autofill-addresses-checkbox-message",
        supportPage: "automatically-fill-your-address-web-forms",
      },
      {
        id: "savedAddressesButton",
        loadPane: "manageAddresses",
        l10nId: "autofill-addresses-manage-addresses-button",
        control: "moz-box-button",
        controlAttrs: {
          "search-l10n-ids": MANAGE_ADDRESSES_L10N_IDS.concat(
            EDIT_ADDRESS_L10N_IDS
          ).join(","),
        },
      },
    ],
  },
  personalInfo: {
    l10nId: "personal-info-group",
    iconSrc: "chrome://browser/skin/personal-info-16.svg",
    headingLevel: 2,
    subcategory: "personal-info-autofill passport-autofill",
    items: [
      {
        id: "saveAndFillPersonalInfo",
        l10nId: "autofill-personal-info-checkbox-message",
        supportPage: "automatically-fill-your-address-web-forms",
      },
      {
        id: "managePersonalInfoButton",
        loadPane: "managePersonalInfo",
        l10nId: "autofill-personal-info-manage-button",
        control: "moz-box-button",
      },
    ],
  },
};

Preferences.addAll([
  // Credit cards and addresses
  { id: ENABLED_AUTOFILL_ADDRESSES_PREF, type: "bool" },
  { id: ENABLED_AUTOFILL_CREDITCARDS_PREF, type: "bool" },

  // Personal info (one .enabled pref per member type)
  ...personalInfoEnabledPrefs().map(pref => ({ id: pref, type: "bool" })),
  {
    id: "extensions.formautofill.creditCards.os-auth.locked.enabled",
    type: "bool",
  },

  // Windows SSO
  { id: "network.http.windows-sso.enabled", type: "bool" },

  // Passwords
  { id: "signon.rememberSignons", type: "bool" },
  { id: "signon.generation.enabled", type: "bool" },
  { id: "signon.autofillForms", type: "bool" },
  { id: "signon.management.page.breach-alerts.enabled", type: "bool" },
  { id: "signon.firefoxRelay.feature", type: "string" },
]);

Preferences.addSetting({
  id: "saveAndFillAddresses",
  pref: ENABLED_AUTOFILL_ADDRESSES_PREF,
  visible: () =>
    FormAutofill.isAutofillTypeAvailable(lazy.AutofillDataTypes.ADDRESS),
});
Preferences.addSetting({
  id: "savedAddressesButton",
  pref: null,
  visible: () =>
    FormAutofill.isAutofillTypeAvailable(lazy.AutofillDataTypes.ADDRESS),
  onUserClick: e => {
    e.preventDefault();
    if (Services.prefs.getBoolPref("browser.settings-redesign.enabled")) {
      window.gotoPref("paneManageAddresses");
    } else {
      window.gSubDialog.open(MANAGE_ADDRESSES_URL);
    }
  },
});

// "Personal info" is a preferences-only grouping of data types (passports
// today; more to come). It is purely a UI concept — the data-type registry is
// intentionally unaware of it — so its membership is listed here.
function personalInfoTypes() {
  return [lazy.AutofillDataTypes.PASSPORT];
}

// The section shows whenever *any* member type is available, rather than being
// tied to a specific type.
function isPersonalInfoCategoryAvailable() {
  return personalInfoTypes().some(typeId =>
    FormAutofill.isAutofillTypeAvailable(typeId)
  );
}

// The `.enabled` prefs of every personal-info member type. The single "Save and
// autofill personal info" checkbox stands in for all of them: it writes every
// pref and reads their logical OR, so there is no separate category-level pref.
function personalInfoEnabledPrefs() {
  return personalInfoTypes().map(
    typeId => lazy.AutofillDataTypes.get(typeId).enabledPref
  );
}

// Register a Setting for each member type's .enabled pref so the aggregate
// checkbox below can depend on them. The Setting framework then owns the change
// notifications, avoiding hand-rolled (and leak-prone) pref observers.
const personalInfoEnabledSettingIds = personalInfoEnabledPrefs().map(pref => {
  const id = `personalInfoEnabled-${pref}`;
  Preferences.addSetting({ id, pref });
  return id;
});

Preferences.addSetting({
  id: "saveAndFillPersonalInfo",
  deps: personalInfoEnabledSettingIds,
  visible: isPersonalInfoCategoryAvailable,
  get: (_, deps) => Object.values(deps).some(dep => dep.value),
  set: (checked, deps) => {
    for (const dep of Object.values(deps)) {
      dep.value = checked;
    }
    return null;
  },
});
Preferences.addSetting({
  id: "managePersonalInfoButton",
  visible: isPersonalInfoCategoryAvailable,
  onUserClick: e => {
    e.preventDefault();
    window.gotoPref("paneManagePersonalInfo");
  },
});

Preferences.addSetting({
  id: "saveAndFillPayments",
  pref: ENABLED_AUTOFILL_CREDITCARDS_PREF,
  visible: () =>
    FormAutofill.isAutofillTypeAvailable(lazy.AutofillDataTypes.CREDIT_CARD),
});
Preferences.addSetting({
  id: "savedPaymentsButton",
  pref: null,
  visible: () =>
    FormAutofill.isAutofillTypeAvailable(lazy.AutofillDataTypes.CREDIT_CARD),
  onUserClick: e => {
    e.preventDefault();

    if (Services.prefs.getBoolPref("browser.settings-redesign.enabled")) {
      window.gotoPref("paneManagePayments");
    } else {
      window.gSubDialog.open(MANAGE_CREDITCARDS_URL);
    }
  },
});
Preferences.addSetting({
  id: "requireOSAuthForPayments",
  visible: () => lazy.OSKeyStore.canReauth(),
  get: () => FormAutofillUtils.getOSAuthEnabled(),
  async set(checked) {
    await lazy.FormAutofillPreferences.trySetOSAuthEnabled(window, checked);

    // Trigger change event to keep checkbox UI in sync with pref value
    Services.obs.notifyObservers(null, "OSAuthEnabledChange");
  },
  setup: emitChange => {
    Services.obs.addObserver(emitChange, "OSAuthEnabledChange");
    return () => Services.obs.removeObserver(emitChange, "OSAuthEnabledChange");
  },
});

/**
 * The autofill lists all mirror formAutofillStorage, so they share the observer
 * that keeps their rendered rows in sync with it. They also all gate adding new
 * records on the matching "save and fill" checkbox, while leaving existing rows
 * editable so records can still be removed once autofill is turned off.
 */
class AutofillListSetting extends Preferences.ListSetting {
  /**
   * Id of the Setting that gates adding new records. AsyncSettings don't
   * support `deps`, so the list watches it directly.
   *
   * @type {string}
   */
  static enabledSettingId;

  get enabledSetting() {
    return Preferences.getSetting(
      /** @type {typeof AutofillListSetting} */ (this.constructor)
        .enabledSettingId
    );
  }

  async getControlConfig() {
    return { addDisabled: !this.enabledSetting?.value };
  }

  setup() {
    Services.obs.addObserver(this.emitChange, "formautofill-storage-changed");
    this.enabledSetting?.on("change", this.emitChange);
    return () => {
      Services.obs.removeObserver(
        this.emitChange,
        "formautofill-storage-changed"
      );
      this.enabledSetting?.off("change", this.emitChange);
    };
  }
}

/**
 * Localizes the strings for a confirm-removal prompt and pairs them with the
 * browsing context it opens in, ready to spread after the record's guid.
 *
 * @param {[string, string, string]} l10nIds The title, confirm and cancel ids.
 * @returns {Promise<[BrowsingContext, string, string, string]>}
 */
async function removePromptArgs(l10nIds) {
  let [title, confirmLabel, cancelLabel] = await document.l10n.formatValues(
    l10nIds.map(id => ({ id }))
  );
  return [
    window.browsingContext.topChromeWindow.browsingContext,
    title,
    confirmLabel,
    cancelLabel,
  ];
}

Preferences.addSetting(
  class extends AutofillListSetting {
    static id = "payments-list";
    static enabledSettingId = "saveAndFillPayments";

    async getItems() {
      await lazy.FormAutofillPreferences.prototype.initializePaymentsStorage();
      let records = await lazy.formAutofillStorage.creditCards.getAll();
      return records
        .sort((a, b) =>
          (a.timeLastUsed || a.timeLastModified) <
          (b.timeLastUsed || b.timeLastModified)
            ? 1
            : -1
        )
        .map(record => ({
          key: record.guid,
          l10nArgs: {
            cardNumber: record["cc-number"].replace(/^(\*+)(\d+)$/, "$1 $2"),
            expDate: (record["cc-exp"] ?? "").replace(
              /^(\d{4})-(\d{2})$/,
              "$2/$1"
            ),
          },
        }));
    }

    async onAdd() {
      window.gSubDialog.open(
        "chrome://formautofill/content/editCreditCard.xhtml"
      );
    }

    async onEdit(guid) {
      lazy.FormAutofillPreferences.prototype.openEditCreditCardDialog(
        guid,
        window
      );
    }

    async onRemove(guid) {
      lazy.FormAutofillPreferences.prototype.openRemovePaymentDialog(
        guid,
        ...(await removePromptArgs([
          "payments-delete-payment-prompt-title",
          "payments-delete-payment-prompt-confirm-button",
          "payments-delete-payment-prompt-cancel-button",
        ]))
      );
    }
  }
);

Preferences.addSetting(
  class extends AutofillListSetting {
    static id = "addresses-list";
    static enabledSettingId = "saveAndFillAddresses";

    async getItems() {
      await lazy.FormAutofillPreferences.prototype.initializeAddressesStorage();
      let addresses = await lazy.formAutofillStorage.addresses.getAll();
      return addresses
        .slice()
        .reverse()
        .map(record => {
          let addressFormatted = [
            record["street-address"],
            record["address-level2"],
            record["address-level1"],
            record.country,
            record["postal-code"],
          ]
            .filter(Boolean)
            .join(", ");
          let label = record.name || record.organization || record.email;
          return {
            key: record.guid,
            label: label || addressFormatted,
            description: label ? addressFormatted : undefined,
          };
        });
    }

    async onAdd() {
      lazy.FormAutofillPreferences.prototype.openEditAddressDialog(
        undefined,
        window
      );
    }

    async onEdit(guid) {
      lazy.FormAutofillPreferences.prototype.openEditAddressDialog(
        guid,
        window
      );
    }

    async onRemove(guid) {
      lazy.FormAutofillPreferences.prototype.openRemoveAddressDialog(
        guid,
        ...(await removePromptArgs([
          "addresses-delete-address-prompt-title",
          "addresses-delete-address-prompt-confirm-button",
          "addresses-delete-address-prompt-cancel-button",
        ]))
      );
    }
  }
);

Preferences.addSetting(
  class extends AutofillListSetting {
    static id = "passports-list";
    static enabledSettingId = "saveAndFillPersonalInfo";

    async getItems() {
      if (
        !FormAutofill.isAutofillTypeAvailable(lazy.AutofillDataTypes.PASSPORT)
      ) {
        return [];
      }
      await lazy.FormAutofillPreferences.prototype.initializePassportsStorage();
      let passports = await lazy.formAutofillStorage.passports.getAll();
      return passports
        .slice()
        .reverse()
        .map(record => {
          let maskedNumber = record["passport-number"]
            ? "****" + record["passport-number"].slice(-4)
            : "";
          let pad = value => String(value).padStart(2, "0");
          let expiry = [
            record["passport-expiry-date-month"] &&
              pad(record["passport-expiry-date-month"]),
            record["passport-expiry-date-day"] &&
              pad(record["passport-expiry-date-day"]),
            record["passport-expiry-date-year"],
          ]
            .filter(Boolean)
            .join("/");
          return {
            key: record.guid,
            label: record["passport-name"] || maskedNumber,
            description: [maskedNumber, expiry].filter(Boolean).join(", "),
          };
        });
    }

    // Show the passport list (its header and, when empty, its empty state)
    // whenever passports are supported. Membership of unsupported types is
    // hidden so the subpage only surfaces data types available to the user.
    visible() {
      return FormAutofill.isAutofillTypeAvailable(
        lazy.AutofillDataTypes.PASSPORT
      );
    }

    async onAdd() {
      lazy.FormAutofillPreferences.prototype.openEditPassportDialog(
        undefined,
        window
      );
    }

    async onEdit(guid) {
      lazy.FormAutofillPreferences.prototype.openEditPassportDialog(
        guid,
        window
      );
    }

    async onRemove(guid) {
      lazy.FormAutofillPreferences.prototype.openRemovePassportDialog(
        guid,
        ...(await removePromptArgs([
          "passports-delete-passport-prompt-title",
          "passports-delete-passport-prompt-confirm-button",
          "passports-delete-passport-prompt-cancel-button",
        ]))
      );
    }
  }
);

Preferences.addSetting({
  id: "savePasswords",
  pref: "signon.rememberSignons",
  controllingExtensionInfo: {
    storeId: "services.passwordSavingEnabled",
    l10nId: "extension-controlling-password-saving",
  },
});

Preferences.addSetting({
  id: "managePasswordExceptions",
  disabled: () =>
    Services.prefs.prefIsLocked(
      "pref.privacy.disable_button.view_passwords_exceptions"
    ),
  onUserClick: () => {
    PasswordSettingHelpers.showPasswordExceptions();
  },
});

Preferences.addSetting({
  id: "fillUsernameAndPasswords",
  pref: "signon.autofillForms",
});

Preferences.addSetting({
  id: "suggestStrongPasswords",
  pref: "signon.generation.enabled",
  visible: () => Services.prefs.getBoolPref("signon.generation.available"),
});

Preferences.addSetting({
  id: "requireOSAuthForPasswords",
  visible: () => lazy.OSKeyStore.canReauth(),
  get: () => lazy.LoginHelper.getOSAuthEnabled(),
  async set(checked) {
    const [messageText, captionText] = await Promise.all([
      lazy.AboutLoginsL10n.formatValue("about-logins-os-auth-dialog-message"),
      lazy.AboutLoginsL10n.formatValue("about-logins-os-auth-dialog-caption"),
    ]);

    await lazy.LoginHelper.trySetOSAuthEnabled(
      window,
      checked,
      messageText,
      captionText
    );

    // Trigger change event to keep checkbox UI in sync with pref value
    Services.obs.notifyObservers(null, "PasswordsOSAuthEnabledChange");
  },
  setup: emitChange => {
    Services.obs.addObserver(emitChange, "PasswordsOSAuthEnabledChange");
    return () =>
      Services.obs.removeObserver(emitChange, "PasswordsOSAuthEnabledChange");
  },
});

Preferences.addSetting({
  id: "allowWindowSSO",
  pref: "network.http.windows-sso.enabled",
  visible: () => AppConstants.platform === "win",
});

Preferences.addSetting({
  id: "manageSavedPasswords",
  onUserClick: () => {
    PasswordSettingHelpers.showPasswords();
  },
  visible: () => {
    let policy = Services.policies.getActivePolicies();
    return (
      policy?.PasswordManagerEnabled !== false &&
      !Services.prefs.prefIsLocked("pref.privacy.disable_button.view_passwords")
    );
  },
});

Preferences.addSetting({
  id: "additionalProtectionsGroup",
});

Preferences.addSetting({
  id: "primaryPasswordNotSet",
  setup(emitChange) {
    const topic = "passwordmgr-primary-pw-changed";
    Services.obs.addObserver(emitChange, topic);
    return () => Services.obs.removeObserver(emitChange, topic);
  },
  visible: () => {
    return !lazy.LoginHelper.isPrimaryPasswordSet();
  },
});

Preferences.addSetting({
  id: "usePrimaryPassword",
  deps: ["primaryPasswordNotSet"],
});

Preferences.addSetting({
  id: "addPrimaryPassword",
  deps: ["primaryPasswordNotSet"],
  onUserClick: () => {
    PasswordSettingHelpers.changeMasterPassword();
  },
  disabled: () => {
    return !Services.policies.isAllowed("createMasterPassword");
  },
});

Preferences.addSetting({
  id: "primaryPasswordSet",
  setup(emitChange) {
    const topic = "passwordmgr-primary-pw-changed";
    Services.obs.addObserver(emitChange, topic);
    return () => Services.obs.removeObserver(emitChange, topic);
  },
  visible: () => {
    return lazy.LoginHelper.isPrimaryPasswordSet();
  },
});

Preferences.addSetting({
  id: "statusPrimaryPassword",
  deps: ["primaryPasswordSet"],
  onUserClick: e => {
    if (e.target.localName == "moz-button") {
      PasswordSettingHelpers._removeMasterPassword();
    }
  },
  getControlConfig(config) {
    const button = config.options?.find(
      o => o.key === "turnOffPrimaryPassword"
    );
    if (button && !Services.policies.isAllowed("removeMasterPassword")) {
      button.controlAttrs = { ...button.controlAttrs, disabled: "" };
    }
    return config;
  },
});

Preferences.addSetting({
  id: "changePrimaryPassword",
  deps: ["primaryPasswordSet"],
  onUserClick: () => {
    PasswordSettingHelpers.changeMasterPassword();
  },
});

Preferences.addSetting({
  id: "breachAlerts",
  pref: "signon.management.page.breach-alerts.enabled",
});

SettingGroupManager.registerGroups({
  passwords: {
    inProgress: false,
    id: "passwordsGroup",
    subcategory: "logins",
    l10nId: "forms-passwords-header",
    headingLevel: 2,
    items: [
      {
        id: "savePasswords",
        l10nId: "forms-ask-to-save-passwords",
        items: [
          {
            id: "managePasswordExceptions",
            l10nId: "forms-manage-password-exceptions",
            control: "moz-box-button",
            controlAttrs: {
              "search-l10n-ids":
                "permissions-address,permissions-exceptions-saved-passwords-window.title,permissions-exceptions-saved-passwords-desc,",
            },
          },
          {
            id: "fillUsernameAndPasswords",
            l10nId: "forms-fill-usernames-and-passwords-2",
            controlAttrs: {
              "search-l10n-ids": "forms-saved-passwords-searchkeywords",
            },
          },
          {
            id: "suggestStrongPasswords",
            l10nId: "forms-suggest-passwords",
            supportPage: "how-generate-secure-password-firefox",
          },
        ],
      },
      {
        id: "requireOSAuthForPasswords",
        l10nId: "forms-os-reauth-2",
      },
      {
        id: "allowWindowSSO",
        l10nId: "forms-windows-sso",
        supportPage: "windows-sso",
      },
      {
        id: "manageSavedPasswords",
        l10nId: "forms-saved-passwords-2",
        control: "moz-box-link",
      },
      {
        id: "additionalProtectionsGroup",
        l10nId: "forms-additional-protections-header",
        control: "moz-fieldset",
        headingLevel: 2,
        items: [
          {
            id: "primaryPasswordNotSet",
            control: "moz-box-group",
            items: [
              {
                id: "usePrimaryPassword",
                l10nId: "forms-primary-pw-use-2",
                control: "moz-box-item",
                supportPage: "primary-password-stored-logins",
              },
              {
                id: "addPrimaryPassword",
                l10nId: "forms-primary-pw-set",
                control: "moz-box-button",
              },
            ],
          },
          {
            id: "primaryPasswordSet",
            control: "moz-box-group",
            items: [
              {
                id: "statusPrimaryPassword",
                control: "moz-box-item",
                options: [
                  {
                    key: "primaryPasswordOnStatus",
                    control: "span",
                    controlAttrs: {
                      class: "primary-pw-status",
                    },
                    options: [
                      {
                        key: "primaryPasswordOnIcon",
                        control: "img",
                        controlAttrs: {
                          src: "chrome://global/skin/icons/check-filled.svg",
                          alt: "",
                          class: "primary-pw-status-icon",
                        },
                      },
                      {
                        key: "primaryPasswordOnLabel",
                        control: "span",
                        l10nId: "forms-primary-pw-on-2",
                      },
                    ],
                  },
                  {
                    key: "turnOffPrimaryPassword",
                    id: "turnOffPrimaryPassword",
                    l10nId: "forms-primary-pw-turn-off",
                    control: "moz-button",
                    slot: "actions",
                  },
                ],
              },
              {
                id: "changePrimaryPassword",
                l10nId: "forms-primary-pw-change-2",
                control: "moz-box-button",
              },
            ],
          },
          {
            id: "breachAlerts",
            l10nId: "forms-breach-alerts",
            supportPage: "lockwise-alerts",
          },
        ],
      },
    ],
  },
  managePayments: {
    items: [
      {
        id: "payments-list",
        control: "setting-list",
        // A card's masked number has to be formatted inside a localized
        // string, so every row is templated rather than carrying a raw label.
        item: {
          l10nId: "payment-moz-box-item",
          iconSrc: "chrome://browser/skin/payment-methods-16.svg",
        },
        headerL10nId: "payments-list-header",
        emptyStateL10nId: "payments-no-payments-stored-message",
        addActionL10nId: "autofill-payment-methods-add-button",
        actions: [
          { name: "edit", l10nId: "payments-edit-payment-button-label" },
          { name: "remove" },
        ],
      },
    ],
  },
  manageAddresses: {
    items: [
      {
        id: "addresses-list",
        control: "setting-list",
        item: { iconSrc: "chrome://browser/skin/notification-icons/geo.svg" },
        headerL10nId: "addresses-list-header",
        emptyStateL10nId: "addresses-no-addresses-stored-message",
        addActionL10nId: "autofill-addresses-add-button",
        actions: [
          { name: "edit", l10nId: "addreses-edit-address-button-label" },
          { name: "remove" },
        ],
      },
    ],
  },
  managePersonalInfo: {
    items: [
      {
        id: "passports-list",
        control: "setting-list",
        item: { iconSrc: "chrome://browser/skin/personal-info-16.svg" },
        headerL10nId: "passports-list-header",
        emptyStateL10nId: "passports-no-passports-stored-message",
        addActionL10nId: "autofill-passports-add-button",
        actions: [
          { name: "edit", l10nId: "passports-edit-passport-button-label" },
          { name: "remove" },
        ],
      },
    ],
  },
});
SettingGroupManager.registerGroups(FORM_AUTOFILL_CONFIG);
Services.obs.notifyObservers(window, "passwordsAutofill-pane-loaded");
