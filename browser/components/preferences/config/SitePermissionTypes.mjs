/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * One site permission that gets a sub-pane listing the sites that have asked
 * for it. {@link SITE_PERMISSION_TYPES} is keyed by the nsIPermissionManager
 * type, so anything that knows which permission it is dealing with can find
 * the pane that lists it.
 *
 * This is only what registering the panes needs before any of them is
 * visited. The settings themselves are in site-permissions.mjs, which the
 * pane imports when the user opens it.
 *
 * @typedef {object} SitePermissionType
 * @property {string} paneId The pane that lists the sites holding this
 *   permission, eg. `about:preferences#permissionsLocation`. It is also the
 *   id of the setting group the pane renders.
 * @property {string} l10nId The pane's heading, also used for its breadcrumb.
 * @property {string} iconSrc
 * @property {string} [blockNewL10nId] The checkbox that blocks new requests,
 *   which carries both its label and its description. Only for permissions
 *   that have a permissions.default.* pref, the rest can't be turned off
 *   from here.
 * @property {{ storeId: string, l10nId: string }} [extensionInfo] How an
 *   extension takes over the block-new-requests checkbox: the
 *   ExtensionSettingsStore id it uses, and the message shown when it has.
 * @property {string} [defaultPref] For a permission whose default is a choice
 *   rather than on or off, the pref behind that choice. The pane offers the
 *   same capabilities the rows do instead of a block-new-requests checkbox.
 * @property {string} [defaultL10nId] Label for that choice.
 */

/** @type {Record<string, SitePermissionType>} */
export const SITE_PERMISSION_TYPES = {
  geo: {
    paneId: "permissionsLocation",
    l10nId: "permissions-pane-location",
    iconSrc: "chrome://browser/skin/notification-icons/geo.svg",
    blockNewL10nId: "permissions-pane-location-block-new",
  },
  camera: {
    paneId: "permissionsCamera",
    l10nId: "permissions-pane-camera",
    iconSrc: "chrome://browser/skin/notification-icons/camera.svg",
    blockNewL10nId: "permissions-pane-camera-block-new",
  },
  microphone: {
    paneId: "permissionsMicrophone",
    l10nId: "permissions-pane-microphone",
    iconSrc: "chrome://browser/skin/notification-icons/microphone.svg",
    blockNewL10nId: "permissions-pane-microphone-block-new",
  },
  speaker: {
    paneId: "permissionsSpeaker",
    l10nId: "permissions-pane-speaker",
    iconSrc: "chrome://browser/skin/notification-icons/speaker.svg",
  },
  "desktop-notification": {
    paneId: "permissionsNotifications",
    l10nId: "permissions-pane-notifications",
    iconSrc:
      "chrome://browser/skin/notification-icons/desktop-notification.svg",
    blockNewL10nId: "permissions-pane-notifications-block-new",
    extensionInfo: {
      storeId: "webNotificationsDisabled",
      l10nId: "extension-controlling-web-notifications",
    },
  },
  "autoplay-media": {
    paneId: "permissionsAutoplay",
    l10nId: "permissions-pane-autoplay",
    iconSrc: "chrome://browser/skin/notification-icons/autoplay-media.svg",
    defaultPref: "media.autoplay.default",
    defaultL10nId: "permissions-pane-autoplay-default",
  },
  xr: {
    paneId: "permissionsVirtualReality",
    l10nId: "permissions-pane-xr",
    iconSrc: "chrome://browser/skin/notification-icons/xr.svg",
    blockNewL10nId: "permissions-pane-xr-block-new",
  },
  "loopback-network": {
    paneId: "permissionsLocalhost",
    l10nId: "permissions-pane-localhost",
    iconSrc: "chrome://global/skin/icons/local-host.svg",
    blockNewL10nId: "permissions-pane-localhost-block-new",
  },
  "local-network": {
    paneId: "permissionsLocalNetwork",
    l10nId: "permissions-pane-local-network",
    iconSrc: "chrome://browser/skin/notification-icons/local-network.svg",
    blockNewL10nId: "permissions-pane-local-network-block-new",
  },
};
