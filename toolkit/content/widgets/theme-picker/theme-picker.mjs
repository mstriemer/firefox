/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.MozXULElement?.insertFTLIfNeeded("locales-preview/theme-picker.ftl");

import { html, styleMap } from "../vendor/lit.all.mjs";
import { MozLitElement } from "../lit-utils.mjs";

/**
 * @import { ReactiveController } from "chrome://global/content/vendor/lit.all.mjs";
 */

// @ts-expect-error Module import type makes it mad.
import themes from "./theme-map.json" with { type: "json" };

const PREF_SYSTEM_USES_DARK = "ui.systemUsesDarkTheme";
const PREF_NATIVE_THEME = "browser.theme.native-theme";
const PREF_ACTIVE_THEME_ID = "extensions.activeThemeID";

/**
 * @param {string} themeId
 */
function themeIdToAddonId(themeId) {
  let theme = themes.find(t => t.id == themeId);
  return theme?.addon_id;
}

/**
 * @param {string} addonId
 */
function addonIdToThemeId(addonId) {
  let addon = themes.find(t => t.addon_id == addonId);
  return addon?.id;
}

/**
 * @implements {ReactiveController}
 */
class ThemePickerDirectController {
  /**
   * @param {ThemePicker} host
   */
  constructor(host) {
    this.host = host;
    this.host.addController(this);
    const { XPCOMUtils } = ChromeUtils.importESModule(
      "resource://gre/modules/XPCOMUtils.sys.mjs"
    );
    this.lazy = XPCOMUtils.declareLazy({
      AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
      AddonRepository: "resource://gre/modules/addons/AddonRepository.sys.mjs",
    });

    this.host.addEventListener(
      "themechange",
      /** @param {ThemechangeEvent} e */
      e => this.onThemechange(e.detail)
    );
  }

  hostConnected() {
    this.updateHost();
  }

  /**
   * @param {ThemechangeEventDetail} state
   */
  async onThemechange({ appearance, nativeTheme, theme }) {
    let themeUpdated = this.setTheme(theme);
    if (appearance == "device") {
      Services.prefs.clearUserPref(PREF_SYSTEM_USES_DARK);
    } else {
      Services.prefs.setIntPref(
        PREF_SYSTEM_USES_DARK,
        appearance == "light" ? 0 : 1
      );
    }
    Services.prefs.setBoolPref(PREF_NATIVE_THEME, nativeTheme);
    await themeUpdated;
    this.updateHost();
  }

  /**
   * @param {string} themeId
   */
  async setTheme(themeId) {
    const addonId = themeIdToAddonId(themeId);
    if (!addonId) {
      return;
    }
    const addon = await this.lazy.AddonManager.getAddonByID(addonId);
    if (addon) {
      await addon.enable();
      return;
    }
    const [repoAddon] = await this.lazy.AddonRepository.getAddonsByIDs([
      addonId,
    ]);
    if (!repoAddon?.sourceURI) {
      return;
    }
    const install = await this.lazy.AddonManager.getInstallForURL(
      // @ts-expect-error sourceURI is never instead of nsURI
      repoAddon.sourceURI.spec,
      { name: repoAddon.name, telemetryInfo: { source: "aboutaddons" } }
    );
    try {
      const theme = await install.install();
      await theme.enable().catch(
        /** @param {Exception} err */
        err => {
          console.error("Error on enabling the theme", theme, err);
        }
      );
    } catch (err) {
      console.error(
        "Error on downloading or installing the theme",
        addonId,
        err
      );
    }
  }

  updateHost() {
    this.host.theme =
      addonIdToThemeId(Services.prefs.getCharPref(PREF_ACTIVE_THEME_ID, "")) ||
      "";
    this.host.nativeTheme = Services.prefs.getBoolPref(
      PREF_NATIVE_THEME,
      false
    );
    let systemUsesDark = Services.prefs.getIntPref(PREF_SYSTEM_USES_DARK, -1);
    if (systemUsesDark == 0) {
      this.host.appearance = "light";
    } else if (systemUsesDark == 1) {
      this.host.appearance = "dark";
    } else {
      this.host.appearance = "device";
    }
  }
}

/**
 * @typedef {{ appearance: string, nativeTheme: boolean, theme: string }} ThemechangeEventDetail
 * @typedef {CustomEvent} ThemechangeEvent
 * @property {ThemechangeEventDetail} detail
 */

/**
 * @implements {ReactiveController}
 */
class ThemePickerStorybookController {
  /**
   * @param {ThemePicker} host
   */
  constructor(host) {
    this.host = host;
    this.host.addController(this);
    this.host.addEventListener(
      "themechange",
      /** @param {ThemechangeEvent} e */
      e => {
        this.host.appearance = e.detail.appearance;
        this.host.theme = e.detail.theme;
        this.host.nativeTheme = e.detail.nativeTheme;
      }
    );
  }

  hostConnected() {
    this.host.theme = "default";
    this.host.appearance = "device";
  }
}

/**
 * Component description goes here.
 *
 * @tagname theme-picker
 * @property {string} variant - Property description goes here
 */
export default class ThemePicker extends MozLitElement {
  static properties = {
    appearance: { type: String },
    theme: { type: String },
    nativeTheme: { type: Boolean },
  };

  constructor() {
    super();
    this.appearance = "device";
    this.theme = "default";
    this.nativeTheme = false;
    this.controller =
      typeof Services === "undefined"
        ? new ThemePickerStorybookController(this)
        : new ThemePickerDirectController(this);
  }

  dispatchChange({
    appearance = this.appearance,
    nativeTheme = this.nativeTheme,
    theme = this.theme,
  }) {
    this.dispatchEvent(
      new CustomEvent("themechange", {
        bubbles: true,
        composed: true,
        detail: { appearance, nativeTheme, theme },
      })
    );
  }

  /**
   * @param {Event & { target: { value: string } }} e
   */
  appearanceChange(e) {
    this.dispatchChange({ appearance: e.target.value });
  }

  /**
   * @param {Event & { target: { value: string } }} e
   */
  themeChange(e) {
    this.dispatchChange({ theme: e.target.value });
  }

  /**
   * @param {Event & { target: { checked: boolean } }} e
   */
  nativeThemeChange(e) {
    this.dispatchChange({ nativeTheme: e.target.checked });
  }

  /**
   * @param {typeof themes[number]} theme
   */
  themeStyle(theme) {
    let colors =
      this.appearance == "dark" ? theme.variants.dark : theme.variants.light;
    return styleMap({
      "--color-start": colors.tabstripStart,
      "--color-end": colors.tabstripEnd,
    });
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://global/content/elements/theme-picker.css"
      />
      <moz-segmented-control
        .value=${this.appearance}
        @change=${this.appearanceChange}
      >
        <moz-segmented-control-item
          value="light"
          label="Light"
          .iconSrc=${"chrome://browser/skin/weather/sunny.svg"}
        ></moz-segmented-control-item>
        <moz-segmented-control-item
          value="dark"
          label="Dark"
          .iconSrc=${"chrome://browser/skin/weather/night-clear.svg"}
        ></moz-segmented-control-item>
        <moz-segmented-control-item
          value="device"
          label="Device"
          .iconSrc=${"chrome://browser/skin/device-desktop.svg"}
        ></moz-segmented-control-item>
      </moz-segmented-control>
      <moz-visual-picker .value=${this.theme} @change=${this.themeChange}>
        ${themes.map(
          theme =>
            html`<moz-visual-picker-item
              labelposition="outside"
              value=${theme.id}
              data-l10n-id=${theme.nameL10nId}
              ><div class="theme-preview" style=${this.themeStyle(theme)}></div
            ></moz-visual-picker-item>`
        )}
      </moz-visual-picker>
      <moz-checkbox
        label="Use Linux system theme"
        ?checked=${this.nativeTheme}
        ?disabled=${this.theme != "default"}
        @change=${this.nativeThemeChange}
      ></moz-checkbox>
    `;
  }
}
customElements.define("theme-picker", ThemePicker);
