# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 0000000 - Site permission sub-panes reuse the strings from the
    entry points and the dialog they replace, part {index}."""

    permissions = "browser/browser/preferences/permissions.ftl"
    preferences = "browser/browser/preferences/preferences.ftl"

    # Each pane's heading is the label of the button that opens it.
    ctx.add_transforms(
        permissions,
        permissions,
        transforms_from(
            """
permissions-pane-location =
    .heading = {COPY_PATTERN(from_path, "permissions-location2.label")}
permissions-pane-camera =
    .heading = {COPY_PATTERN(from_path, "permissions-camera2.label")}
permissions-pane-microphone =
    .heading = {COPY_PATTERN(from_path, "permissions-microphone2.label")}
permissions-pane-speaker =
    .heading = {COPY_PATTERN(from_path, "permissions-speaker2.label")}
permissions-pane-notifications =
    .heading = {COPY_PATTERN(from_path, "permissions-notification2.label")}
permissions-pane-autoplay =
    .heading = {COPY_PATTERN(from_path, "permissions-autoplay2.label")}
permissions-pane-xr =
    .heading = {COPY_PATTERN(from_path, "permissions-xr2.label")}
permissions-pane-localhost =
    .heading = {COPY_PATTERN(from_path, "permissions-localhost2.label")}
permissions-pane-local-network =
    .heading = {COPY_PATTERN(from_path, "permissions-local-network2.label")}
""",
            from_path=preferences,
        ),
    )

    # A row states its capability as text where there is no choice to make,
    # which is what the dialog's list items did, and each pane's block new
    # requests checkbox is the dialog's checkbox and its description in one
    # message.
    ctx.add_transforms(
        permissions,
        permissions,
        transforms_from(
            """
permissions-pane-capability-allow = {COPY_PATTERN(from_path, "permissions-capabilities-listitem-allow.value")}
permissions-pane-capability-block = {COPY_PATTERN(from_path, "permissions-capabilities-listitem-block.value")}
permissions-pane-location-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-location-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-location-disable-desc")}
permissions-pane-camera-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-camera-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-camera-disable-desc")}
permissions-pane-microphone-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-microphone-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-microphone-disable-desc")}
permissions-pane-notifications-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-notification-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-notification-disable-desc")}
permissions-pane-xr-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-xr-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-xr-disable-desc")}
permissions-pane-localhost-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-localhost-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-localhost-disable-desc")}
permissions-pane-local-network-block-new =
    .label = {COPY_PATTERN(from_path, "permissions-site-local-network-disable-label.label")}
    .description = {COPY_PATTERN(from_path, "permissions-site-local-network-disable-desc")}
""",
            from_path=permissions,
        ),
    )
