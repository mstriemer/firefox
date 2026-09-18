/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { EventEmitter } = ChromeUtils.importESModule(
  "resource://gre/modules/EventEmitter.sys.mjs"
);

/** @import { SettingControlConfig } from "chrome://browser/content/preferences/widgets/setting-control.mjs" */
/** @import { ListAction, SettingListConfig } from "chrome://browser/content/preferences/widgets/setting-list.mjs" */
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
 * @property {ListAction[]} [actions] Defaults to the {@link SettingListConfig} actions.
 * @property {boolean} [disabled] Disable this row's actions. The setting-wide
 *   case stays on {@link AsyncSetting.disabled}.
 */

// TODO: This class should go in its own ListSetting.mjs file.
/**
 * A setting backed by a list of records that the user can manage, rendered by
 * the setting-list control. This class only covers the list's behaviour, how
 * the rows are presented is declared in the {@link SettingListConfig} that
 * renders them.
 *
 * The rows are the setting's value, so they reach the control through the same
 * plumbing as any other AsyncSetting and a list can be another setting's dep.
 * Writes are the asymmetric half, they are scoped to one row and arrive as
 * actions instead of through set(). Subclasses should call emitChange,
 * generally from a setup() observer, whenever the backing store changes so the
 * rows are recomputed.
 *
 * Every action the config declares is routed to an `on<Action>` method, so a
 * list that offers `[{ name: "edit" }, { name: "remove" }]` implements
 * `onEdit(key)` and `onRemove(key)`, and one with an add button implements
 * `onAdd()`. These are handlers for the user activating the action, the work
 * itself generally happens in a dialog, which is why they aren't named after
 * the mutation they lead to.
 */
export class ListSetting extends AsyncSetting {
  /** @type {SettingListItem[]} */
  defaultValue = [];

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
   * A list's value is its rows.
   *
   * @returns {Promise<SettingListItem[]>}
   */
  async get() {
    return this.getItems();
  }

  /**
   * Handle the user activating one of the actions the config declared, or the
   * add button. The default implementation routes the action to its
   * `on<Action>` method, so an action named "setAllowed" calls
   * `onSetAllowed(key, value)`. Override this when the action names aren't
   * known ahead of time.
   *
   * There are no `onAdd`/`onEdit`/`onRemove` defaults on purpose: declaring an
   * action the list doesn't handle is a mistake worth hearing about.
   *
   * @param {string} action The name of the action.
   * @param {string} [key] The row's key, undefined for the add button.
   * @param {any} [value] The action's value, for an action that offers a
   *   choice rather than a command.
   */
  onListAction(action, key, value) {
    let method = `on${action[0].toUpperCase()}${action.slice(1)}`;
    if (typeof this[method] != "function") {
      console.error(
        `The "${action}" action on ${this.constructor.id} needs a ${method}() method`
      );
      return;
    }
    this[method](key, value);
  }
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
    [
      this.cachedValue,
      this.cachedDisabled,
      this.cachedVisible,
      this.cachedGetControlConfig,
    ] = await Promise.all([
      this.asyncSetting.get(),
      this.asyncSetting.disabled(),
      this.asyncSetting.visible(),
      this.asyncSetting.getControlConfig(),
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

  /**
   * @param {string} action
   * @param {string} [key]
   * @param {any} [value]
   */
  onListAction(action, key, value) {
    let listSetting = /** @type {ListSetting} */ (this.asyncSetting);
    listSetting.onListAction(action, key, value);
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
