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
 * @import { ListSetting, SettingListItem } from "chrome://global/content/preferences/AsyncSetting.mjs"
 * @import { SettingControlConfig } from "chrome://browser/content/preferences/widgets/setting-control.mjs"
 * @import { TemplateResult } from "chrome://global/content/vendor/lit.all.mjs"
 */

/**
 * An action button rendered at the end of a list row, or above the list in the
 * case of "add". The name is passed back to the {@link ListSetting} with the
 * row's key, see {@link ListSetting.onListAction}.
 *
 * @typedef {object} ListAction
 * @property {string} name The action to perform, passed back with the row's key.
 * @property {string} [l10nId] The button's label, generally an `.aria-label`.
 *   Defaults to a shared label for the well known actions.
 * @property {string} [iconSrc] Defaults to the standard icon for the well
 *   known actions.
 */

/**
 * The presentation every row shares. A row's own {@link SettingListItem} only
 * carries data, anything that is the same for every row is declared here.
 *
 * @typedef {object} SettingListItemConfig
 * @property {string} [l10nId] Localize the whole row from one message, with
 *   the row's `l10nArgs` filling it in. For templated rows, eg. a masked card
 *   number that has to be formatted inside a localized string.
 * @property {string} [iconSrc] The icon for every row, unless it overrides it.
 */

/**
 * The authored configuration of a `setting-list` control. Rows are generated
 * data and come from the {@link ListSetting}, everything the list needs to
 * present them is declared here alongside the rest of the config tree.
 *
 * @typedef {object} SettingListConfigExtensions
 * @property {ListAction[]} [actions] The actions offered on every row, in
 *   render order, unless a row overrides them.
 * @property {SettingListItemConfig} [item] The presentation every row shares.
 * @property {string} [headerL10nId] An optional header row.
 * @property {string} [emptyStateL10nId] Shown in place of the rows when there
 *   are none.
 * @property {string} [addActionL10nId] The add button's label. The button is
 *   only rendered when this is set, and activating it sends the "add" action.
 * @property {boolean} [addDisabled] Disable only the add button, generally
 *   returned from {@link ListSetting.getControlConfig} rather than authored.
 *
 * @typedef {SettingControlConfig & SettingListConfigExtensions} SettingListConfig
 */

/**
 * Presentation the component supplies for the actions it knows about, so a
 * list can declare `{ name: "remove" }` and get the shared label and icon.
 *
 * @type {Record<string, Partial<ListAction>>}
 */
const ACTION_DEFAULTS = {
  add: { iconSrc: "chrome://global/skin/icons/plus.svg" },
  edit: { iconSrc: "chrome://global/skin/icons/edit.svg" },
  remove: {
    l10nId: "setting-list-remove-button",
    iconSrc: "chrome://global/skin/icons/delete.svg",
  },
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
    config: { type: Object },
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

    /** @type {SettingListConfig | undefined} */
    this.config = undefined;

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
   * @param {SettingListConfig} config
   * @returns {TemplateResult | typeof nothing}
   */
  addTemplate(config) {
    if (!config.addActionL10nId) {
      return nothing;
    }
    return html`<moz-button
      class="setting-list-add"
      data-l10n-id=${config.addActionL10nId}
      .iconSrc=${ACTION_DEFAULTS.add.iconSrc}
      ?disabled=${this.disabled || config.addDisabled}
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
    let defaults = ACTION_DEFAULTS[action.name] ?? {};
    return html`<moz-button
      slot="actions"
      class="setting-list-action"
      type="icon"
      data-action=${action.name}
      data-key=${item.key}
      data-l10n-id=${ifDefined(action.l10nId ?? defaults.l10nId)}
      .iconSrc=${action.iconSrc ?? defaults.iconSrc ?? ""}
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
   * A row's actions, which default to the ones the config declares for the
   * whole list.
   *
   * @param {SettingListItem} item
   * @param {SettingListConfig} config
   * @returns {ListAction[]}
   */
  rowActions(item, config) {
    return item.actions ?? config.actions ?? [];
  }

  /**
   * @param {SettingListItem} item
   * @param {SettingListConfig} config
   * @returns {TemplateResult}
   */
  itemTemplate(item, config) {
    let itemConfig = config.item ?? {};
    return html`<moz-box-item
      class="setting-list-item"
      data-key=${item.key}
      label=${ifDefined(item.label)}
      description=${ifDefined(
        typeof item.description == "string" ? item.description : undefined
      )}
      data-l10n-id=${ifDefined(item.l10nId ?? itemConfig.l10nId)}
      data-l10n-args=${ifDefined(this.#l10nArgs(item.l10nArgs))}
      .iconSrc=${item.iconSrc ?? itemConfig.iconSrc ?? ""}
    >
      ${this.descriptionTemplate(item)}
      ${this.rowActions(item, config).map(action =>
        this.actionTemplate(item, action)
      )}
    </moz-box-item>`;
  }

  render() {
    let items = this.setting?.items;
    if (!items) {
      throw new ListSettingNotDefinedError(this.setting?.id);
    }
    let config = this.config ?? {};
    return html`${this.addTemplate(config)}
      <moz-box-group type="list">
        ${this.headerTemplate(config.headerL10nId)}
        ${items.length
          ? repeat(
              items,
              item => item.key,
              item => this.itemTemplate(item, config)
            )
          : this.emptyStateTemplate(config.emptyStateL10nId)}
      </moz-box-group>`;
  }
}
customElements.define("setting-list", SettingList);
