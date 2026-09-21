/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { SITE_PERMISSION_TYPES } from "chrome://browser/content/preferences/config/SitePermissionTypes.mjs";

/** @import { SitePermissionType } from "chrome://browser/content/preferences/config/SitePermissionTypes.mjs" */
/** @import { ListAction } from "chrome://browser/content/preferences/widgets/setting-list.mjs" */
/** @import { SettingControlConfig } from "chrome://browser/content/preferences/widgets/setting-control.mjs" */

/** @typedef {{ option?: string, text?: string }} CapabilityL10nIds */

const { SitePermissions } = ChromeUtils.importESModule(
  "resource:///modules/SitePermissions.sys.mjs"
);

/**
 * The capabilities a site can be listed with. A permission in any other state
 * isn't something the user set, so it isn't shown.
 */
const PERMISSION_STATES = [
  SitePermissions.ALLOW,
  SitePermissions.BLOCK,
  SitePermissions.PROMPT,
  SitePermissions.AUTOPLAY_BLOCKED_ALL,
];

/**
 * How each capability reads, either as a choice in a row's dropdown or as
 * static text when a permission only has one capability to offer.
 *
 * @type {Record<number, CapabilityL10nIds>}
 */
const CAPABILITY_L10N_IDS = {
  [SitePermissions.ALLOW]: {
    option: "permissions-capabilities-allow",
    text: "permissions-pane-capability-allow",
  },
  [SitePermissions.BLOCK]: {
    option: "permissions-capabilities-block",
    text: "permissions-pane-capability-block",
  },
  [SitePermissions.PROMPT]: {
    option: "permissions-capabilities-prompt",
  },
};

/**
 * Permissions whose capabilities are worth naming more specifically.
 *
 * @type {Record<string, Record<number, CapabilityL10nIds>>}
 */
const CAPABILITY_L10N_IDS_BY_PERMISSION = {
  "autoplay-media": {
    [SitePermissions.ALLOW]: {
      option: "permissions-capabilities-autoplay-allow",
    },
    [SitePermissions.BLOCK]: {
      option: "permissions-capabilities-autoplay-block",
    },
    [SitePermissions.AUTOPLAY_BLOCKED_ALL]: {
      option: "permissions-capabilities-autoplay-blockall",
    },
  },
};

/**
 * @param {string} permission
 * @param {number} capability
 * @returns {CapabilityL10nIds}
 */
function capabilityL10nIds(permission, capability) {
  return {
    ...CAPABILITY_L10N_IDS[capability],
    ...CAPABILITY_L10N_IDS_BY_PERMISSION[permission]?.[capability],
  };
}

/**
 * The capabilities a permission offers, without the one that means "ask",
 * which isn't something a listed site can be set to.
 *
 * @param {string} permission
 * @returns {number[]}
 */
function availableStates(permission) {
  return SitePermissions.getAvailableStates(permission).filter(
    (/** @type {number} */ state) => state != SitePermissions.UNKNOWN
  );
}

/**
 * Every permission one origin holds for one permission type. Permissions may
 * be single or double keyed, eg. speaker permissions are keyed by device, so
 * a row can stand for more than one of them.
 */
class PermissionGroup {
  /**
   * @param {string} permission The permission type the group belongs to.
   * @param {nsIPermission} perm
   */
  constructor(permission, perm) {
    this.permission = permission;
    this.principal = perm.principal;
    this.origin = perm.principal.origin;
    /** @type {nsIPermission[]} */
    this.perms = [perm];
  }

  /**
   * The one capability to present for the group. This caters for
   * speaker-selection, where a block permission may be set for all devices
   * with no second key, which would override any device-specific allow.
   *
   * @type {number}
   */
  get capability() {
    let capability = SitePermissions.UNKNOWN;
    for (let perm of this.perms) {
      let [type] = perm.type.split(SitePermissions.PERM_KEY_DELIMITER);
      if (type == perm.type) {
        // No second key. This overrides double-keyed perms.
        return perm.capability;
      }
      // Double-keyed perms are not expected to have different capabilities.
      capability = perm.capability;
    }
    return capability;
  }

  /**
   * The capabilities the user can choose between, which always includes the
   * one the group already has, even when it isn't otherwise on offer.
   *
   * @type {number[]}
   */
  get states() {
    let states = availableStates(this.permission);
    if (!states.includes(this.capability)) {
      states.unshift(this.capability);
    }
    return states;
  }
}

/**
 * @param {nsIPermission} perm
 * @param {string} permission
 * @returns {boolean} Whether this is a permission the user set for a site.
 */
function isListedPermission(perm, permission) {
  let [type] = perm.type.split(SitePermissions.PERM_KEY_DELIMITER);
  return (
    type == permission &&
    PERMISSION_STATES.includes(perm.capability) &&
    SitePermissions.isSupportedPrincipal(perm.principal) &&
    // Skip private browsing session permissions.
    !(
      perm.principal.privateBrowsingId !=
        Services.scriptSecurityManager.DEFAULT_PRIVATE_BROWSING_ID &&
      perm.expireType == Services.perms.EXPIRE_SESSION
    )
  );
}

/**
 * @param {string} permission
 * @returns {PermissionGroup[]} One group per origin, sorted by origin.
 */
function permissionGroups(permission) {
  /** @type {Map<string, PermissionGroup>} */
  let groups = new Map();
  for (let perm of Services.perms.all) {
    if (!isListedPermission(perm, permission)) {
      continue;
    }
    let group = groups.get(perm.principal.origin);
    if (group) {
      group.perms.push(perm);
    } else {
      groups.set(perm.principal.origin, new PermissionGroup(permission, perm));
    }
  }
  let collator = new Services.intl.Collator(undefined, { usage: "sort" });
  return [...groups.values()].sort((a, b) =>
    collator.compare(a.origin, b.origin)
  );
}

/**
 * One origin as a row: the site, and what it is allowed to do. The capability
 * is a dropdown when there is a choice to make and static text when there
 * isn't, which is the same rule the dialog this replaces used.
 */
export class SitePermissionRow extends Preferences.SettingListRow {
  get key() {
    return this.record.origin;
  }

  get label() {
    return this.record.origin;
  }

  get description() {
    if (this.record.states.length > 1) {
      return undefined;
    }
    let { text } = capabilityL10nIds(
      this.record.permission,
      this.record.capability
    );
    return text ? { l10nId: text } : undefined;
  }

  /** @type {ListAction[]} */
  get actions() {
    /** @type {number[]} */
    let states = this.record.states;
    if (states.length < 2) {
      return [{ name: "remove" }];
    }
    return [
      {
        name: "setCapability",
        control: "moz-select",
        l10nId: "permissions-pane-capability-label",
        value: String(this.record.capability),
        options: states.map(state => ({
          value: String(state),
          l10nId: capabilityL10nIds(this.record.permission, state).option,
        })),
      },
      { name: "remove" },
    ];
  }
}

/**
 * The sites that hold one permission. Changes apply as they are made, unlike
 * the dialog this replaces, which staged them until it was accepted.
 */
class SitePermissionsListSetting extends Preferences.ListSetting {
  /**
   * The nsIPermissionManager type this lists.
   *
   * @type {string}
   */
  static permission;

  /** @type {Map<string, PermissionGroup>} */
  #groupsByOrigin = new Map();

  get permission() {
    return /** @type {typeof SitePermissionsListSetting} */ (this.constructor)
      .permission;
  }

  setup() {
    Services.obs.addObserver(this.emitChange, "perm-changed");
    return () => Services.obs.removeObserver(this.emitChange, "perm-changed");
  }

  async getRecords() {
    let groups = permissionGroups(this.permission);
    this.#groupsByOrigin = new Map(groups.map(group => [group.origin, group]));
    return groups;
  }

  /**
   * @param {string} action
   * @param {string} [key] The row's origin.
   * @param {any} [value]
   */
  onListAction(action, key, value) {
    let group = key && this.#groupsByOrigin.get(key);
    if (!group) {
      return;
    }
    switch (action) {
      case "remove":
        removeGroup(group);
        break;
      case "setCapability":
        setGroupCapability(group, Number(value));
        break;
    }
  }
}

/**
 * @param {PermissionGroup} group
 */
function removeGroup(group) {
  for (let perm of group.perms) {
    SitePermissions.removeFromPrincipal(group.principal, perm.type);
  }
}

/**
 * @param {PermissionGroup} group
 * @param {number} capability
 */
function setGroupCapability(group, capability) {
  if (group.capability == capability) {
    return;
  }
  // Clear the group out first, so that a double-keyed permission doesn't
  // survive alongside the single-keyed one we are about to set.
  removeGroup(group);
  SitePermissions.setForPrincipal(
    group.principal,
    group.permission,
    capability
  );
}

/**
 * Registers the settings and the group for one permission's sub-pane. Every
 * one of these panes is the same list of sites with the same actions, so the
 * only thing that changes between them is which permission they are about.
 *
 * @param {string} permission The nsIPermissionManager type.
 * @param {SitePermissionType} type
 */
function registerSitePermissionPane(permission, type) {
  let { paneId } = type;
  let listId = `${paneId}-list`;
  let blockNewId = `${paneId}-block-new`;
  let defaultId = `${paneId}-default`;
  let removeAllId = `${paneId}-remove-all`;

  Preferences.addSetting(
    class extends SitePermissionsListSetting {
      static id = listId;
      static permission = permission;
    }
  );

  Preferences.addSetting({
    id: removeAllId,
    deps: [listId],
    disabled: deps => {
      let records = /** @type {any[]} */ (deps[listId]?.value ?? []);
      return !records.length;
    },
    onUserClick: () => {
      for (let group of permissionGroups(permission)) {
        removeGroup(group);
      }
    },
  });

  /** @type {SettingControlConfig[]} */
  let items = [
    {
      id: listId,
      control: "setting-list",
      row: SitePermissionRow,
      emptyStateL10nId: "permissions-pane-empty",
    },
    {
      id: removeAllId,
      l10nId: "permissions-remove-all",
      control: "moz-button",
    },
  ];

  let { defaultPref } = type;
  if (defaultPref) {
    Preferences.addSetting({
      id: defaultId,
      get: () => String(SitePermissions.getDefault(permission)),
      set: value => {
        SitePermissions.setDefault(permission, Number(value));
        return null;
      },
      disabled: () => Services.prefs.prefIsLocked(defaultPref),
      setup: emitChange => {
        Services.prefs.addObserver(defaultPref, emitChange);
        return () => Services.prefs.removeObserver(defaultPref, emitChange);
      },
    });
    // The sites in the list are the ones that don't follow this, so it reads
    // above them rather than below.
    items.unshift({
      id: defaultId,
      l10nId: type.defaultL10nId,
      control: "moz-select",
      options: availableStates(permission).map(state => ({
        key: String(state),
        value: String(state),
        l10nId: capabilityL10nIds(permission, state).option,
      })),
    });
  }

  if (type.blockNewL10nId) {
    let pref = `permissions.default.${permission}`;
    Preferences.add({ id: pref, type: "int" });
    Preferences.addSetting({
      id: blockNewId,
      pref,
      controllingExtensionInfo: type.extensionInfo,
      get: value => value == SitePermissions.BLOCK,
      set: checked =>
        checked ? SitePermissions.BLOCK : SitePermissions.UNKNOWN,
    });
    items.push({ id: blockNewId, l10nId: type.blockNewL10nId });
  }

  SettingGroupManager.registerGroup(paneId, { items });
}

for (let [permission, type] of Object.entries(SITE_PERMISSION_TYPES)) {
  registerSitePermissionPane(permission, type);
}
