# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 0000000 - Share one remove button label across settings lists, part {index}."""

    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
setting-list-remove-button =
    .aria-label = {COPY_PATTERN(from_path, "payments-delete-payment-button-label.aria-label")}
""",
            from_path=source,
        ),
    )
