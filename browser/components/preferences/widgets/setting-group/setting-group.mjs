/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, ifDefined } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

export class SettingGroup extends MozLitElement {
  static properties = {
    config: { type: Object },
    groupId: { type: String },
    // getSetting should be Preferences.getSetting from preferencesBindings.js
    getSetting: { type: Function },
  };

  static queries = {
    controlEls: { all: "setting-control" },
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("setting-change", this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("setting-change", this);
  }

  handleEvent(e) {
    if (e.type == "setting-change") {
      // When a setting changes, it could affect visibility or layout. Run
      // through the render process to make any changes.
      // FIXME: This is actually a workaround for the zoom text warning not
      // being dependent on the zoom text only setting.
      this.requestUpdate();
    }
  }

  async getUpdateComplete() {
    let result = await super.getUpdateComplete();
    await Promise.all([...this.controlEls].map(el => el.updateComplete));
    return result;
  }

  /**
   * Notify child controls when their input has fired an event. When controls
   * are nested the parent receives events for the nested controls, so this is
   * actually easier to manage here; it also registers fewer listeners.
   */
  onChange(e) {
    let inputEl = e.target;
    let control = inputEl.control;
    control?.onChange(inputEl);
  }

  itemTemplate(item) {
    let setting = this.getSetting(item.id);
    if (!setting.visible) {
      return "";
    }
    return html`<setting-control
      .setting=${setting}
      .config=${item}
      .getSetting=${this.getSetting}
    ></setting-control>`;
  }

  render() {
    if (!this.config) {
      return "";
    }
    return html`<moz-fieldset
      data-l10n-id=${ifDefined(this.config.l10nId)}
      .headingLevel=${this.config.headingLevel}
      @change=${this.onChange}
      >${this.config.items.map(item => this.itemTemplate(item))}</moz-fieldset
    >`;
  }
}
customElements.define("setting-group", SettingGroup);
