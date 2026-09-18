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
