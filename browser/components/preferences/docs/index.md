# Settings lists

A *settings list* is a setting whose value is a list of records the user can
manage: saved payment methods, the sites that hold a permission, the rules a
VPN applies per website. The list renders as rows with actions, and the
records live in whatever store owns them rather than in a pref.

This page describes the shared code behind those lists and how to build a new
one. The two lists in the tree today, the autofill lists in
`config/passwords-autofill.mjs` and the site permission lists in
`config/site-permissions.mjs`, exist partly to exercise this API and are worth
reading alongside it.

## The three pieces

A list is always three things, and keeping them apart is the whole design:

Config
: What the list looks like here. An item in the config tree with
  `control: "setting-list"`, declaring the actions, the header, the empty
  state, and which class presents a row. Authored by hand.

`ListSetting`
: What is in the list and what the actions do. A class registered with
  `Preferences.addSetting()` that reads records out of a store and handles the
  actions the user triggers. It knows nothing about how the rows look.

`SettingListRow`
: How one record reads. A class that takes a record and answers what the row
  should show. Named by the config, so the same records can be presented
  differently in another place.

A minimal list, with all three:

```js
class BlockedSiteRow extends Preferences.SettingListRow {
  get key() {
    return this.record.origin;
  }

  get label() {
    return this.record.origin;
  }

  get iconSrc() {
    return "chrome://global/skin/icons/blocked.svg";
  }
}

Preferences.addSetting(
  class extends Preferences.ListSetting {
    static id = "blocked-sites-list";

    setup() {
      Services.obs.addObserver(this.emitChange, "blocked-sites-changed");
      return () =>
        Services.obs.removeObserver(this.emitChange, "blocked-sites-changed");
    }

    async getRecords() {
      return BlockedSites.getAll();
    }

    onListAction(action, key) {
      if (action == "remove") {
        BlockedSites.remove(key);
      }
    }
  }
);

SettingGroupManager.registerGroup("blockedSites", {
  items: [
    {
      id: "blocked-sites-list",
      control: "setting-list",
      row: BlockedSiteRow,
      emptyStateL10nId: "blocked-sites-empty",
      actions: [{ name: "remove" }],
    },
  ],
});
```

## How the data moves

```{mermaid}
flowchart TD
    store[("Record store")] -->|getRecords| setting["ListSetting"]
    setting -->|"records, as the setting's value"| list["setting-list"]
    list -->|"new Row(record)"| rows["A moz-box-item per row"]
    rows -->|"onListAction(action, key, value)"| setting
    setting -->|write| store
    store -.->|"observer → emitChange"| setting
```

Reads and writes take different paths, which is the one asymmetry worth
holding in your head:

**Reads** go through the ordinary setting value. `ListSetting.get()` returns
`getRecords()`, so the records are the setting's value and are cached,
refreshed and delivered exactly like any other `AsyncSetting`'s value. Two
things fall out of that: a list can be another setting's `deps` (the site
permission panes disable "Remove all websites" that way), and `setting-list`
reads `setting.value` and treats a non-array as "this setting isn't a list".

**Writes** are scoped to one record, so they arrive as actions rather than
through `set()`. Activating a row's control calls
`ListSetting.onListAction(action, key, value)` with the action's name, the
row's `key`, and a value if the control had one.

Nothing is staged. A pane has no accept button, so a change applies the moment
it is made. If the store notifies (a `Services.obs` topic, a pref observer),
subscribe in `setup()` and call `this.emitChange`; the records are read again
and the rows re-render, whether the change came from this pane or from
somewhere else entirely.

## Reference

### Config

Keys a `control: "setting-list"` item accepts, on top of the usual config item
keys. See `SettingListConfig` in
`browser/components/preferences/widgets/setting-list/setting-list.mjs`.

| Key | Meaning |
| --- | --- |
| `row` | The `SettingListRow` subclass that presents each record. Omit it when the records are already row shaped. |
| `actions` | The actions offered on every row, in render order. |
| `headerL10nId` | An optional header row above the list. |
| `emptyStateL10nId` | Shown in place of the rows when there are none. |
| `addActionL10nId` | Label for an add button above the list. The button only renders when this is set, and sends the `"add"` action. |
| `addDisabled` | Disables only the add button. Comes from `getControlConfig()` rather than being authored. |

### `ListSetting`

In `toolkit/content/preferences/ListSetting.mjs`, exported as
`Preferences.ListSetting`. It extends `AsyncSetting`, so `setup()`,
`visible()`, `disabled()` and `getControlConfig()` all work as they do
there.

`getRecords()`
: The records to list, in order. Async. These are the records themselves, not
  anything renderable.

`onListAction(action, key, value)`
: The user activated an action. `key` is the row's key, absent for the add
  button. `value` is the control's value for an action that offers a choice.

`getControlConfig()`
: Inherited. Returning `{ addDisabled: true }` from here is how a list turns
  its add button off dynamically.

`emitChange`
: Inherited. Call it when the store changes so the records are read again.

### `SettingListRow`

Also in `ListSetting.mjs`, exported as `Preferences.SettingListRow`. Construct
it with a record, override the getters you need. Everything except `key` has a
default of "nothing".

| Getter | Renders as |
| --- | --- |
| `key` | Row identity, passed back to `onListAction`. Required. |
| `label` | The row's text. Raw, not localized. |
| `description` | Secondary text. A string, or `{ l10nId, l10nArgs }` when it needs localizing. |
| `iconSrc` | The row's icon. |
| `l10nId` / `l10nArgs` | Localize the whole row from one message, for text that has to be formatted inside a string. |
| `actions` | This row's actions, replacing the config's. |
| `disabled` | Disables this row's actions. |

A row with nothing to compute can be a plain object with those properties
instead of a class.

### Actions

An action is a button unless it names a `control`. Buttons named `add`, `edit`
and `remove` get a default icon, and `remove` a default label, so
`{ name: "remove" }` is enough. Anything else needs an `l10nId`, which is
generally rendered as an `aria-label`.

An action with a `control` reports a value instead of a command. The control's
`change` event sends the action with its value, so the same `onListAction`
handles both kinds:

```js
{
  name: "setRule",
  control: "moz-select",
  l10nId: "vpn-website-rule-label",
  value: String(this.record.rule),
  options: [
    { value: "0", l10nId: "vpn-rule-through-vpn" },
    { value: "1", l10nId: "vpn-rule-bypass-vpn" },
  ],
}
```

Options render as `moz-option`, so `moz-select` is the control this supports
today. The choices usually differ per row, so a value action generally comes
from the row's `actions` rather than the config's.

## Putting a list in a sub-pane

A list usually gets its own sub-pane, reached from a button on its parent
pane. Register the pane in `CONFIG_PANES` in `preferences.js`, or with
`SettingPaneManager.registerPane()` when it is conditional:

```js
  websiteRules: {
    parent: "privacy",
    l10nId: "vpn-website-rules-pane",
    iconSrc: "chrome://browser/skin/vpn.svg",
    groupIds: ["websiteRules"],
    module: "chrome://browser/content/preferences/config/vpn.mjs",
  },
```

The key is the pane id, which is also the URL hash
(`about:preferences#websiteRules`), so pick it with a reader in mind. `module`
is imported the first time the pane is visited, which is where the settings
and the group get registered. The pane's `l10nId` needs a `.heading`
attribute, and doubles as the breadcrumb label.

The button that opens it lives on the parent pane and navigates:

```js
Preferences.addSetting({
  id: "websiteRulesButton",
  onUserClick: () => window.gotoPref("websiteRules"),
});
```

with `loadPane: "websiteRules"` on the button's *config item* (not on the
setting) so search highlights it.

:::{note}
A setting group's config `id` lands on the group element in the DOM, where it
would collide with the pane's own name and break keyboard focus in the
category nav. Don't give a group an `id` matching a pane id; the site
permission groups pass no `id` at all.
:::

## Adding and editing records

`setting-list` has no inline editing. An `add` or `edit` action opens a
dialog, the dialog writes to the store, and the store's change notification
brings the list back up to date. The handler does not wait for the dialog or
update anything itself:

```js
  onListAction(action, key) {
    switch (action) {
      case "add":
        window.gSubDialog.open("chrome://browser/content/vpn/websiteRule.xhtml");
        break;
      case "edit":
        window.gSubDialog.open(
          "chrome://browser/content/vpn/websiteRule.xhtml",
          undefined,
          { id: key }
        );
        break;
      case "remove":
        WebsiteRules.remove(key);
        break;
    }
  }
```

That is why the handlers are named for the user's action rather than the
mutation: `onListAction("add")` opens a dialog, and the record may never be
created.

## VPN website rules

The pieces map onto this feature as:

* **One `ListSetting`** over the website-rule store: `getRecords()` returns the
  rules, `setup()` subscribes to whatever the store notifies on, and
  `onListAction` opens the create/edit dialog and deletes rules.
* **One `SettingListRow`** turning a rule into a row: the website as `label`,
  and whatever the row shows about the rule as `description` or as a value
  action.
* **One config item** in a group on a sub-pane, declaring the row class, the
  actions, the empty state and the add button.
* **One dialog** for create and edit, opened through `gSubDialog` with the
  rule's id for edit and nothing for create.

:::{warning}
I could not open the two Figma files while writing this, so the mapping above
is the shape of the API rather than a reading of the design. These are the
decisions the design settles, each of which changes the code:

* Whether a row's rule is a **dropdown on the row** (a value action, as in the
  site permission panes) or **text plus an edit button** that opens the dialog.
  The first keeps the common change one click away; the second suits a rule
  with more than one field.
* What the row shows besides the website: an icon (a favicon needs `iconSrc`
  per row), a second line, a state badge. A badge is not something a row can
  render today.
* Whether the list needs **grouping, sorting controls or a filter**. None of
  those exist; see the limits below.
* Whether the empty state is a line of text (supported) or an illustration
  with a call to action (not supported).
:::

## Testing

Two levels, both with examples in the tree:

* **Widget behaviour** belongs in the chrome test
  `tests/chrome/test_setting_list.html`, which registers throwaway
  `ListSetting`s and asserts on the rendered rows. Add to it when you change
  the shared code, not when you add a list.
* **A list itself** gets a browser test that opens its pane and drives it, like
  `tests/browser_sitePermissionsSubpane.js`. Assert against the store, not just
  the DOM: the point of the pane is that it writes through.

Rows are `.setting-list-item` with the row's key in `data-key`, and actions are
`.setting-list-action` with `data-action`, so a test can find a specific row's
remove button with
`.setting-list-action[data-action="remove"]` inside
`[data-key="..."]`.

## Limits worth knowing before you start

These are all things the current lists either do without or work around:

* **A row's `actions` replaces the config's** rather than extending them, so a
  row that adds a dropdown has to re-list `remove` next to it.
* **`onListAction` gets the key, not the record**, so a setting that needs the
  record maps the key back itself.
* **No search, filter or sort controls.** Rows render in the order
  `getRecords()` returns them.
* **No inline editing and no staging.** Edits happen in a dialog and apply
  immediately.
* **No add-by-typing.** The add button opens a dialog; a list that wants an
  address field in the list itself has nowhere to put it, which is why the
  popup and add-on exception lists still use `permissions.xhtml`.
* **Value actions only render `moz-select`.** Another control needs a tag map
  in `setting-list`.
