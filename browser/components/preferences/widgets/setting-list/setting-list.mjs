/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  ifDefined,
  nothing,
  repeat,
} from "chrome://global/content/vendor/lit.all.mjs";
import { SettingElement } from "chrome://browser/content/preferences/widgets/setting-element.mjs";

/**
 * @import { Setting } from "chrome://global/content/preferences/Setting.mjs"
 * @import { ListAction, SettingListConfig, SettingListItem } from "chrome://global/content/preferences/AsyncSetting.mjs"
 * @import { TemplateResult } from "chrome://global/content/vendor/lit.all.mjs"
 */

/**
 * Icons used when a {@link ListAction} doesn't provide its own. There is no
 * default l10nId since the label of an edit button generally names the kind of
 * record being managed.
 */
const ACTION_ICONS = {
  add: "chrome://global/skin/icons/plus.svg",
  edit: "chrome://global/skin/icons/edit.svg",
  remove: "chrome://global/skin/icons/delete.svg",
};

/**
 * The remove action every removable list shares, so a list only has to opt in
 * with {@link ListSetting.removable} rather than declare it.
 *
 * @type {ListAction}
 */
const REMOVE_ACTION = {
  name: "remove",
  l10nId: "setting-list-remove-button",
  iconSrc: ACTION_ICONS.remove,
};

export class ListSettingNotDefinedError extends Error {
  /** @param {string} settingId */
  constructor(settingId) {
    super(
      `Setting "${settingId}" is not a list. Did you extend Preferences.ListSetting?`
    );
    this.name = "ListSettingNotDefinedError";
    this.settingId = settingId;
  }
}

/**
 * Renders the rows of a {@link ListSetting} as a moz-box-group. Rows are plain
 * moz-box-items owned by this element rather than nested setting-controls, so
 * there is no Setting lookup per row and clicks are handled here and routed
 * back through the Setting.
 */
export class SettingList extends SettingElement {
  static ListSettingNotDefinedError = ListSettingNotDefinedError;

  static properties = {
    setting: { type: Object },
    disabled: { type: Boolean },
  };

  static queries = {
    addEl: ".setting-list-add",
    groupEl: "moz-box-group",
    headerEl: ".setting-list-header",
    emptyStateEl: ".setting-list-empty",
    itemEls: { all: ".setting-list-item" },
    actionEls: { all: ".setting-list-action" },
  };

  /** @type {Setting | null} */
  #subscribedSetting = null;

  constructor() {
    super();

    /** @type {Setting | undefined} */
    this.setting = undefined;

    /** @type {boolean} */
    this.disabled = false;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#subscribe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#unsubscribe();
  }

  /**
   * @type {SettingElement['willUpdate']}
   */
  willUpdate(changedProperties) {
    if (changedProperties.has("setting")) {
      this.#unsubscribe();
      this.#subscribe();
    }
  }

  // The setting's data changes out-of-band, eg. after a record is removed in a
  // dialog, so re-read the rows whenever it notifies us.
  #onSettingChange = () => {
    this.requestUpdate();
  };

  #subscribe() {
    if (this.setting && this.#subscribedSetting != this.setting) {
      this.setting.on("change", this.#onSettingChange);
      this.#subscribedSetting = this.setting;
    }
  }

  #unsubscribe() {
    this.#subscribedSetting?.off("change", this.#onSettingChange);
    this.#subscribedSetting = null;
  }

  /**
   * @param {Record<string, any> | undefined} l10nArgs
   * @returns {string | undefined}
   */
  #l10nArgs(l10nArgs) {
    return l10nArgs ? JSON.stringify(l10nArgs) : undefined;
  }

  /**
   * @param {MouseEvent} event
   */
  onActionClick(event) {
    let button = /** @type {HTMLElement} */ (event.currentTarget);
    this.setting.listAction(button.dataset.action, button.dataset.key);
  }

  onAddClick() {
    this.setting.listAction("add");
  }

  /**
   * @param {SettingListConfig} listConfig
   * @returns {TemplateResult | typeof nothing}
   */
  addTemplate(listConfig) {
    if (!listConfig.addActionL10nId) {
      return nothing;
    }
    return html`<moz-button
      class="setting-list-add"
      data-l10n-id=${listConfig.addActionL10nId}
      .iconSrc=${ACTION_ICONS.add}
      ?disabled=${this.disabled || listConfig.addDisabled}
      @click=${this.onAddClick}
    ></moz-button>`;
  }

  /**
   * @param {string} [headerL10nId]
   * @returns {TemplateResult | typeof nothing}
   */
  headerTemplate(headerL10nId) {
    if (!headerL10nId) {
      return nothing;
    }
    return html`<moz-box-item
      slot="header"
      class="setting-list-header"
      data-l10n-id=${headerL10nId}
    ></moz-box-item>`;
  }

  /**
   * @param {string} [emptyStateL10nId]
   * @returns {TemplateResult | typeof nothing}
   */
  emptyStateTemplate(emptyStateL10nId) {
    if (!emptyStateL10nId) {
      return nothing;
    }
    return html`<moz-box-item
      class="setting-list-empty"
      data-l10n-id=${emptyStateL10nId}
    ></moz-box-item>`;
  }

  /**
   * @param {SettingListItem} item
   * @param {ListAction} action
   * @returns {TemplateResult}
   */
  actionTemplate(item, action) {
    return html`<moz-button
      slot="actions"
      class="setting-list-action"
      type="icon"
      data-action=${action.name}
      data-key=${item.key}
      data-l10n-id=${action.l10nId}
      .iconSrc=${action.iconSrc ?? ACTION_ICONS[action.name] ?? ""}
      ?disabled=${this.disabled || item.disabled}
      @click=${this.onActionClick}
    ></moz-button>`;
  }

  /**
   * A description that needs localizing goes in the description slot so the
   * row's label can stay raw data instead of being routed through a Fluent
   * template just to reach the widget.
   *
   * @param {SettingListItem} item
   * @returns {TemplateResult | typeof nothing}
   */
  descriptionTemplate(item) {
    let { description } = item;
    if (!description || typeof description == "string") {
      return nothing;
    }
    return html`<span
      slot="description"
      data-l10n-id=${description.l10nId}
      data-l10n-args=${ifDefined(this.#l10nArgs(description.l10nArgs))}
    ></span>`;
  }

  /**
   * A row's actions, with the shared remove action appended last. `removable`
   * is a property of the list, so a row's own `actions` only replaces the
   * declared actions, not the remove one.
   *
   * @param {SettingListItem} item
   * @param {SettingListConfig} listConfig
   * @returns {ListAction[]}
   */
  rowActions(item, listConfig) {
    let actions = item.actions ?? listConfig.actions;
    return listConfig.removable ? [...actions, REMOVE_ACTION] : actions;
  }

  /**
   * @param {SettingListItem} item
   * @param {ListAction[]} actions
   * @returns {TemplateResult}
   */
  itemTemplate(item, actions) {
    return html`<moz-box-item
      class="setting-list-item"
      data-key=${item.key}
      label=${ifDefined(item.label)}
      description=${ifDefined(
        typeof item.description == "string" ? item.description : undefined
      )}
      data-l10n-id=${ifDefined(item.l10nId)}
      data-l10n-args=${ifDefined(this.#l10nArgs(item.l10nArgs))}
      .iconSrc=${item.iconSrc ?? ""}
    >
      ${this.descriptionTemplate(item)}
      ${actions.map(action => this.actionTemplate(item, action))}
    </moz-box-item>`;
  }

  render() {
    let listConfig = this.setting?.listConfig;
    if (!listConfig) {
      throw new ListSettingNotDefinedError(this.setting?.id);
    }
    let items = this.setting.items;
    return html`${this.addTemplate(listConfig)}
      <moz-box-group type="list">
        ${this.headerTemplate(listConfig.headerL10nId)}
        ${items.length
          ? repeat(
              items,
              item => item.key,
              item => this.itemTemplate(item, this.rowActions(item, listConfig))
            )
          : this.emptyStateTemplate(listConfig.emptyStateL10nId)}
      </moz-box-group>`;
  }
}
customElements.define("setting-list", SettingList);
