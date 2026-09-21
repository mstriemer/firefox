/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AsyncSetting } from "chrome://global/content/preferences/AsyncSetting.mjs";

/** @import { SettingControlConfig } from "chrome://browser/content/preferences/widgets/setting-control.mjs" */
/** @import { ListAction, SettingListConfig } from "chrome://browser/content/preferences/widgets/setting-list.mjs" */

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

/**
 * How one record is presented as a row. Subclasses read `this.record` and
 * override the getters they need, so the mapping from a record to what the
 * user sees lives in one place instead of being spread between the setting
 * and the config.
 *
 * The config names the class, the {@link ListSetting} only supplies records,
 * so this is the presentation of a record in one particular place. A record
 * shown somewhere else as well is a second row class in that place's config
 * rather than a branch in this one.
 *
 * @implements {SettingListItem}
 */
export class SettingListRow {
  /**
   * @param {any} record The record this row presents.
   */
  constructor(record) {
    this.record = record;
  }

  /**
   * Stable row identity, passed back to {@link ListSetting.onListAction}.
   *
   * @abstract
   * @type {string}
   */
  get key() {
    throw new Error(`${this.constructor.name} needs to implement key`);
  }

  /**
   * Raw, unlocalized label, such as a domain or a nickname.
   *
   * @type {string | undefined}
   */
  get label() {
    return undefined;
  }

  /** @type {string | FluentString | undefined} */
  get description() {
    return undefined;
  }

  /** @type {string | undefined} */
  get iconSrc() {
    return undefined;
  }

  /**
   * Localize the whole row from one message, for a row whose text has to be
   * formatted inside a localized string.
   *
   * @type {string | undefined}
   */
  get l10nId() {
    return undefined;
  }

  /** @type {Record<string, any> | undefined} */
  get l10nArgs() {
    return undefined;
  }

  /**
   * The actions for this row, which default to the ones the config declares
   * for the whole list.
   *
   * @type {ListAction[] | undefined}
   */
  get actions() {
    return undefined;
  }

  /** @type {boolean} */
  get disabled() {
    return false;
  }
}

/**
 * A setting backed by a list of records that the user can manage, rendered by
 * the setting-list control. This class only covers the list's behaviour, how
 * the rows are presented is declared in the {@link SettingListConfig} that
 * renders them.
 *
 * The records are the setting's value, so they reach the control through the
 * same plumbing as any other AsyncSetting and a list can be another setting's
 * dep. Writes are the asymmetric half, they are scoped to one record and
 * arrive as actions instead of through set(). Subclasses should call
 * emitChange, generally from a setup() observer, whenever the backing store
 * changes so the records are read again.

 */
export class ListSetting extends AsyncSetting {
  /** @type {any[]} */
  defaultValue = [];

  /**
   * The records to list, in the order they should appear. How each one is
   * presented is the config's {@link SettingListConfig.row}, so these are the
   * records themselves rather than anything the control can render.
   *
   * @abstract
   * @returns {Promise<any[]>}
   */
  async getRecords() {
    return [];
  }

  /**
   * A list's value is its records.
   *
   * @returns {Promise<any[]>}
   */
  async get() {
    return this.getRecords();
  }

  /**
   * Handle the user activating one of the actions the config declared, or the
   * add button. The work generally happens in a dialog, so this handles the
   * user asking for the action rather than performing it.
   *
   * @abstract
   * @param {string} action The name of the action, eg. "remove".
   * @param {string} [key] The row's key, undefined for the add button.
   * @param {any} [value] The action's value, for an action that offers a
   *   choice rather than a command.
   */
  // eslint-disable-next-line no-unused-vars
  onListAction(action, key, value) {}
}
