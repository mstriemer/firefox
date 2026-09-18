/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { EventEmitter } = ChromeUtils.importESModule(
  "resource://gre/modules/EventEmitter.sys.mjs"
);

/** @import { SettingControlConfig } from "chrome://browser/content/preferences/widgets/setting-control.mjs" */
/** @import { SettingConfig, SettingValue } from "./Setting.mjs" */

/**
 * This is the interface for the async setting classes to implement.
 *
 * For the actual implementation see AsyncSettingMixin.
 */
export class AsyncSetting extends EventEmitter {
  static id = "";

  /** @type {SettingConfig['controllingExtensionInfo']} */
  static controllingExtensionInfo;

  /** @type {SettingValue} */
  defaultValue = "";
  defaultDisabled = false;
  defaultVisible = true;
  /** @type {Partial<SettingControlConfig>} */
  defaultGetControlConfig = {};

  /**
   * Emit a change event to notify listeners that the setting's data has
   * changed and should be updated.
   */
  emitChange = () => {
    this.emit("change");
  };

  /**
   * Setup any external listeners that are required for managing this
   * setting's state. When the state needs to update the Setting.emitChange method should be called.
   *
   * @returns {ReturnType<SettingConfig['setup']>} Teardown function to clean up external listeners.
   */
  setup() {}

  /**
   * Called before the setting values will be cached. You can start any shared
   * work here if you need the same value in multiple callbacks.
   *
   * @example
   * class Attendees extends AsyncSetting {
   *   beforeRefresh() {
   *     this.attendees = MeetingDb.getAttendees();
   *   }
   *   get() {
   *     return this.attendees;
   *   }
   *   async visible() {
   *     return (await this.attendees).length;
   *   }
   * }
   */
  beforeRefresh() {}

  /**
   * Get the value of this setting.
   *
   * @abstract
   * @returns {Promise<SettingValue>}
   */
  async get() {}

  /**
   * Set the value of this setting.
   *
   * @abstract
   * @param {SettingValue} value The value from the input that triggered the update.
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async set(value) {}

  /**
   * Whether the control should be disabled.
   *
   * @returns {Promise<boolean>}
   */
  async disabled() {
    return false;
  }

  /**
   * Whether the control should be visible.
   *
   * @returns {Promise<boolean>}
   */
  async visible() {
    return true;
  }

  /**
   * Override the initial control config. This will be spread into the
   * initial config, with this object taking precedence.
   *
   * @returns {Promise<Partial<SettingControlConfig>>}
   */
  async getControlConfig() {
    return {};
  }

  /**
   * Callback fired after a user has changed the setting's value. Useful for
   * recording telemetry.
   *
   * @param {SettingValue} value
   */
  // eslint-disable-next-line no-unused-vars
  onUserChange(value) {}

  /**
   * Callback fired after a user has clicked a setting's control.
   *
   * @param {MouseEvent} event
   */
  // eslint-disable-next-line no-unused-vars
  onUserClick(event) {}

  /**
   * Callback fired after a user has dismissed a message bar.
   *
   * @param {CustomEvent} event
   */
  //eslint-disable-next-line no-unused-vars
  onMessageBarDismiss(event) {}

  /**
   * Callback fired after items in a reorderable list have been reordered.
   * This should be used to update the underlying data when the user
   * reorders items, such as updating preference values.
   *
   * @param {CustomEvent} event - reorder event with detail containing draggedElement, targetElement, position, draggedIndex, targetIndex
   */
  //eslint-disable-next-line no-unused-vars
  onUserReorder(event) {}
}

/**
 * @typedef {object} FluentString
 * @property {string} l10nId A Fluent message id.
 * @property {Record<string, any>} [l10nArgs] Arguments for the Fluent message.
 */

/**
 * An action button rendered at the end of a list row. The "edit" and "remove"
 * names are handled by {@link ListSetting.editItem} and
 * {@link ListSetting.removeItem}, any other name is forwarded to
 * {@link ListSetting.onListAction}.
 *
 * @typedef {object} ListAction
 * @property {string} name The action to perform, passed back with the row's key.
 * @property {string} l10nId The button's label, generally an `.aria-label`.
 * @property {string} [iconSrc] Defaults to the standard icon for "edit" and "remove".
 */

/**
 * One row of a list. This is generated data rather than hand authored layout,
 * so unlike {@link SettingControlConfig} it lives outside the config tree and
 * rows are not Settings themselves.
 *
 * @typedef {object} SettingListItem
 * @property {string} key Stable row identity, passed back to the ListSetting callbacks.
 * @property {string} [label] Raw, unlocalized label, such as a domain or a nickname.
 * @property {string | FluentString} [description] Secondary text for the row.
 * @property {string} [iconSrc]
 * @property {string} [l10nId] Localize the whole row from one message, for templated rows.
 * @property {Record<string, any>} [l10nArgs]
 * @property {ListAction[]} [actions] Defaults to the ListSetting's static actions.
 * @property {boolean} [disabled] Disable this row's actions. The setting-wide
 *   case stays on {@link AsyncSetting.disabled}.
 */

/**
 * The data a list control needs beyond its rows.
 *
 * @typedef {object} SettingListConfig
 * @property {ListAction[]} actions
 * @property {boolean} removable
 * @property {string} [headerL10nId]
 * @property {string} [emptyStateL10nId]
 * @property {string} [addActionL10nId]
 * @property {boolean} [addDisabled]
 */

// TODO: This class should go in its own ListSetting.mjs file.
/**
 * A setting backed by a list of records that the user can manage, rendered by
 * the setting-list control.
 *
 * Rows come from getItems() rather than the value plumbing because a list is
 * asymmetric: a read is the whole array while a write is scoped to a single
 * row. Subclasses should call emitChange, generally from a setup() observer,
 * whenever the backing store changes so the rows are recomputed.
 */
export class ListSetting extends AsyncSetting {
  // TODO: The supported actions can be here, but the actions that are exposed
  // should go in the SettingControlConfig (SettingListConfig?)
  // TODO: Could we move actions into some mixin call like class extends
  // ListSetting(["add", "setAllowed"]) {} which would then require the `onAdd`
  // and `onSetAllowed` methods to be implemented? This could remove the need
  // for `removable`
  /**
   * The actions offered on every row, unless a row overrides them. The remove
   * action isn't listed here, see {@link ListSetting.removable}.
   *
   * @type {ListAction[]}
   */
  static actions = [];

  /**
   * Whether rows can be removed. The remove action is always rendered last and
   * uses a shared label, so it doesn't need to be declared as an action.
   */
  static removable = false;

  // TODO: The l10nIds are a concern for the SettingControlConfig (now
  // SettingListConfig variant?), they shouldn't be here
  /**
   * Fluent id for an optional header row.
   *
   * @type {string | undefined}
   */
  static headerL10nId;

  /**
   * Fluent id for the message shown in place of the rows when there are none.
   *
   * @type {string | undefined}
   */
  static emptyStateL10nId;

  /**
   * Fluent id for the add button's label. The button is only rendered when this
   * is set, and activating it calls {@link ListSetting.addItem}.
   *
   * @type {string | undefined}
   */
  static addActionL10nId;

  /**
   * The rows to render.
   *
   * @abstract
   * @returns {Promise<SettingListItem[]>}
   */
  async getItems() {
    return [];
  }

  /**
   * Whether the add button should be disabled. The setting-wide
   * {@link AsyncSetting.disabled} covers the rows, this covers only adding, so
   * a list can stay editable while it refuses new records.
   *
   * @returns {Promise<boolean>}
   */
  async addDisabled() {
    return false;
  }

  // TODO: should {add,edit,remove}Item be start{Add,Edit,Remove}Item? They
  // don't do the actual work in this API.
  /**
   * Add a new record, generally by opening a dialog.
   *
   * @returns {Promise<void>}
   */
  async addItem() {}

  /**
   * Edit the record behind a row, generally by opening a dialog.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async editItem(key) {}

  /**
   * Remove the record behind a row. Writes apply immediately, there is no
   * staging or commit step.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async removeItem(key) {}

  // TODO: Downloads has a dropdown, how is that handled (input event vs click)
  /**
   * Handle an action other than "edit" or "remove".
   *
   * @param {string} action
   * @param {string} key
   */
  // eslint-disable-next-line no-unused-vars
  onListAction(action, key) {}
}

/**
 * @param {typeof AsyncSetting} AsyncSettingClass
 * @returns {boolean}
 */
function isListSettingClass(AsyncSettingClass) {
  return (
    AsyncSettingClass == ListSetting ||
    ListSetting.isPrototypeOf(AsyncSettingClass)
  );
}

/**
 * Wraps an AsyncSetting and adds caching of values to provide a synchronous
 * API to the Setting class.
 *
 * @implements {SettingConfig}
 */
export class AsyncSettingHandler {
  /** @type {AsyncSetting} */
  asyncSetting;

  /** @type {Function} */
  #emitChange;

  /** @type {boolean} */
  #isList;

  /**
   * The parts of a list's config that come from the class rather than from an
   * async callback. Only set for {@link ListSetting} subclasses.
   *
   * @type {SettingListConfig | undefined}
   */
  #listConfig;

  /** @type {string} */
  pref;

  /**
   * Dependencies are not supported on AsyncSettings, but we include an empty
   * array for consistency with {@link SettingConfig}.
   *
   * @type {string[]}
   */
  deps = [];

  /** @type {SettingConfig['controllingExtensionInfo']} */
  controllingExtensionInfo;

  /**
   * @param {string} id
   * @param {typeof AsyncSetting} AsyncSettingClass
   */
  constructor(id, AsyncSettingClass) {
    this.asyncSetting = new AsyncSettingClass();
    this.id = id;
    this.controllingExtensionInfo = AsyncSettingClass.controllingExtensionInfo;
    this.#emitChange = () => {};

    // Initialize cached values with defaults
    this.cachedValue = this.asyncSetting.defaultValue;
    this.cachedDisabled = this.asyncSetting.defaultDisabled;
    this.cachedVisible = this.asyncSetting.defaultVisible;
    this.cachedGetControlConfig = this.asyncSetting.defaultGetControlConfig;
    /** @type {SettingListItem[]} */
    this.cachedItems = [];
    this.cachedAddDisabled = false;

    this.#isList = isListSettingClass(AsyncSettingClass);
    if (this.#isList) {
      let ListSettingClass = /** @type {typeof ListSetting} */ (
        AsyncSettingClass
      );
      this.#listConfig = {
        actions: ListSettingClass.actions ?? [],
        removable: ListSettingClass.removable ?? false,
        headerL10nId: ListSettingClass.headerL10nId,
        emptyStateL10nId: ListSettingClass.emptyStateL10nId,
        addActionL10nId: ListSettingClass.addActionL10nId,
      };
    }

    // Listen for change events from the async setting
    this.asyncSetting.on("change", () => this.refresh());
  }

  /**
   * @param {() => any} emitChange
   * @returns {ReturnType<SettingConfig['setup']>}
   */
  setup(emitChange) {
    let teardown = this.asyncSetting.setup();

    this.#emitChange = emitChange;

    this.refresh();
    return teardown;
  }

  /**
   * Called to trigger async tasks and re-cache values.
   */
  async refresh() {
    this.asyncSetting.beforeRefresh();
    let listSetting = /** @type {ListSetting} */ (this.asyncSetting);
    [
      this.cachedValue,
      this.cachedDisabled,
      this.cachedVisible,
      this.cachedGetControlConfig,
      this.cachedItems,
      this.cachedAddDisabled,
    ] = await Promise.all([
      this.asyncSetting.get(),
      this.asyncSetting.disabled(),
      this.asyncSetting.visible(),
      this.asyncSetting.getControlConfig(),
      this.#isList ? listSetting.getItems() : [],
      this.#isList ? listSetting.addDisabled() : false,
    ]);
    this.#emitChange();
  }

  /**
   * @returns {SettingValue}
   */
  get() {
    return this.cachedValue;
  }

  /**
   * @param {any} value
   * @returns {Promise<void>}
   */
  set(value) {
    return this.asyncSetting.set(value);
  }

  /**
   * @returns {boolean}
   */
  disabled() {
    return this.cachedDisabled;
  }

  /**
   * @returns {boolean}
   */
  visible() {
    return this.cachedVisible;
  }

  /**
   * @param {SettingControlConfig} config
   * @returns {SettingControlConfig}
   */
  getControlConfig(config) {
    return {
      ...config,
      ...this.cachedGetControlConfig,
    };
  }

  // TODO: These are really only application to ListSetting, they shouldn't be
  // on a generic AsyncSettingHandler
  /**
   * @returns {SettingListItem[]}
   */
  getItems() {
    return this.cachedItems;
  }

  /**
   * @returns {SettingListConfig | undefined}
   */
  getListConfig() {
    if (!this.#isList) {
      return undefined;
    }
    return { ...this.#listConfig, addDisabled: this.cachedAddDisabled };
  }

  /**
   * @param {string} action
   * @param {string} key
   */
  onListAction(action, key) {
    let listSetting = /** @type {ListSetting} */ (this.asyncSetting);
    switch (action) {
      case "add":
        listSetting.addItem();
        break;
      case "edit":
        listSetting.editItem(key);
        break;
      case "remove":
        listSetting.removeItem(key);
        break;
      default:
        listSetting.onListAction(action, key);
    }
  }

  /**
   * @param {SettingValue} value
   */
  onUserChange(value) {
    return this.asyncSetting.onUserChange(value);
  }

  /**
   * @param {MouseEvent} event
   */
  onUserClick(event) {
    this.asyncSetting.onUserClick(event);
  }

  /**
   * @param {CustomEvent} event
   */
  onMessageBarDismiss(event) {
    this.asyncSetting.onMessageBarDismiss(event);
  }

  /**
   * @param {CustomEvent} event
   */
  onUserReorder(event) {
    this.asyncSetting.onUserReorder(event);
  }
}
