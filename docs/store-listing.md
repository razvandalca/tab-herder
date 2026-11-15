# Chrome Web Store listing

Copy-paste source for the Chrome Web Store developer dashboard. Keep it in step with
[`manifest.config.ts`](../manifest.config.ts): every permission in the manifest needs a justification
below, and reviewers compare the two.

## Store listing tab

### Name

Tab Herder

(Comes from `name` in the manifest; the dashboard does not let you edit it separately.)

### Short description (summary, max 132 characters)

The manifest `description` (from `package.json`) is shown as the summary:

> Manage Chrome tabs with native tab groups: auto-group, clean up, save sessions.

### Detailed description

```text
Tab Herder keeps your tabs in order using Chrome's own tab groups — no new tab page, no sidebar
to learn, no account.

AUTO-GROUPING
• Group on demand or automatically as tabs load.
• Your rules first: match by domain, URL pattern, regular expression or title keyword. Tabs that
  match no rule are grouped by site.
• Presets for Dev, Docs, Social, Video, Shopping, Mail/Calendar and Cloud consoles.
• Respects you: pinned tabs are never touched, tabs you drag by hand stay where you put them, and
  groups you made yourself are left alone.

SAFE CLEANUP
• Close duplicate tabs (ignoring #fragments and tracking parameters like utm_*, fbclid, gclid).
• Discard or close tabs you haven't used for N hours, on a schedule or with one click.
• Optional per-group auto-close after X minutes without activity.
• Never closes pinned tabs, tabs playing audio, the active tab, allowlisted sites, or (optionally)
  tabs with unsaved form input.
• Everything closed goes to "Recently cleaned" with one-click restore.

SESSIONS
• Save a window or a single group under a name and restore it later with the original group
  names and colours.
• Optional autosave: snapshot all windows every few minutes and restore after a crash.
• Snooze a tab or a whole group: close it now, reopen it tonight, tomorrow, next week or any time you pick.
• Export and import sessions and rules as JSON.

POPUP AND SHORTCUTS
• Fuzzy search across all open tabs and jump to any of them.
• Open the same view in Chrome's side panel to keep it open while you browse.
• Group actions: close, save & close, collapse/expand, ungroup, rename, recolour, move to a new
  window — also from the right-click menu.
• Keyboard shortcuts: Alt+Shift+G group now, Alt+Shift+W close current group, Alt+Shift+D close
  duplicates, Alt+Shift+F open tab search (remappable).

PRIVATE BY DESIGN
No server, no account, no analytics. Settings and rules sync through Chrome Sync if you use it;
everything else stays on your device. The page-reading features (unsaved-form detection, group by
content) are off by default and ask for permission only when you turn them on.

Open source: https://github.com/razvandalca/tab-herder
```

### Category

**Productivity → Workflow & Planning** (alternative: **Tools**).

### Language

English.

### Graphic assets

| Asset | Size | Source |
|---|---|---|
| Store icon | 128×128 PNG (96×96 artwork, 16 px transparent padding) | `release/store-icon-128.png`, written by `bun run icons`. |
| Screenshots | 1280×800 PNG, 24-bit, no alpha (1–5 allowed) | `release/screenshots/*.png`, written by `bun run build && bun run screenshots` (needs `bunx playwright install chromium` once). Upload all five. |
| Small promo tile | 440×280 | Optional, not generated. |
| Marquee promo tile | 1400×560 | Optional, not generated. |

`release/` is git-ignored; regenerate the assets locally before uploading.

### Additional fields

- **Official URL:** none (needs a verified domain in Search Console; leave empty).
- **Homepage URL:** `https://github.com/razvandalca/tab-herder`
- **Support URL:** `https://github.com/razvandalca/tab-herder/issues`
- **Mature content:** No.

## Privacy practices tab

### Single purpose

```text
Tab Herder organises the user's open tabs with Chrome's native tab groups: it groups tabs by the
user's rules or by site, closes or discards duplicate and inactive tabs safely, and saves groups or
windows as sessions that can be restored later. All of its features act on the user's own tabs and
tab groups.
```

### Permission justifications

One entry per permission in `manifest.config.ts`. The dashboard shows a box for each `permissions`
entry and one "host permission" box for the host access.

| Permission | Manifest key | Justification to paste |
|---|---|---|
| `tabs` | `permissions` | Reads the URL, title and favicon of open tabs to match the user's grouping rules, detect duplicate tabs, find inactive tabs to discard or close, show the searchable tab list in the popup, and save tabs into sessions. Data never leaves the device. |
| `tabGroups` | `permissions` | Core feature: creates tab groups and renames, recolours, collapses, ungroups and moves them to a new window, and restores saved groups with their original names and colours. |
| `storage` | `permissions` | Stores the user's settings and rules (`chrome.storage.sync`), saved sessions, snoozed tabs and groups waiting to reopen, the "Recently cleaned" restore list, daily cleanup counts and aggregate daily tab-count insights (domain names and counts only, no URLs; `chrome.storage.local`), and short-lived state such as which groups the extension created (`chrome.storage.session`). Nothing is sent to a server. |
| `alarms` | `permissions` | Runs the scheduled cleanup pass (default every 15 minutes, user-configurable), which also applies per-group auto-close and takes the local open-tab-count sample for the Insights tab. Also runs the optional autosave snapshot and reopens snoozed tabs and groups at the time the user chose. Alarms are needed because the Manifest V3 service worker is not always running. |
| `contextMenus` | `permissions` | Adds a "Tab Herder" submenu to the page and toolbar-icon right-click menus for tab and group actions: group all tabs now, close / save & close / move this tab's group, collapse, expand, ungroup or close all groups, close duplicates, clean up now, open the side panel. |
| `sidePanel` | `permissions` | Shows the same Tab Herder view (tab search, groups in this window, quick actions) in Chrome's side panel, so it can stay open while the user browses. Opened only when the user clicks the panel button in the popup, the "Open in side panel" right-click entry, a shortcut they bound themselves, or Chrome's side panel menu. Reads nothing beyond what the popup already shows. |
| `scripting` | `optional_permissions` | Optional, requested at runtime only when the user enables "Never touch tabs with unsaved form input" or "Group by content". Used to register one bundled content script that flags whether the user typed into a form (the text itself is never read) and reads the page's meta description for the local content classifier. Removed again when both options are turned off. |
| `<all_urls>` | `optional_host_permissions` | Optional, requested together with `scripting` for the same two opt-in features: the content script has to run on whichever site the user has open to protect unsaved form input or classify the page. It is not granted at install, and the extension works fully without it. |

Not permissions, but reviewers sometimes ask:

- `commands` (keyboard shortcuts) and `incognito: "spanning"` need no permission. Incognito tabs are
  skipped unless the user enables them in settings **and** allows the extension in incognito.
- `options_page`, the `action` popup and the `side_panel` page are bundled pages.

### Remote code

**No, I am not using remote code.** All JavaScript is bundled in the package; there is no `eval`, no
remotely hosted script and no `<script src="https://…">`.

### Data usage

Tab Herder does not collect or transmit user data (the Web Store defines "collect" as transmitting it
off the user's device). Leave every data-type box **unchecked**.

> If a reviewer pushes back on tab URLs: those are processed locally only. A conservative alternative is
> to tick **Web history** and **Website content** and state that the data is used only locally for the
> extension's single purpose — but the accurate answer is "none collected".

Tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

`https://razvandalca.github.io/tab-herder/privacy/`

Served by GitHub Pages from [`docs/privacy.md`](privacy.md) once Pages is enabled (see
[publishing.md](publishing.md#one-time-setup)). Until then the file on GitHub works as a fallback:
`https://github.com/razvandalca/tab-herder/blob/main/docs/privacy.md`.

## Distribution tab

- **Visibility:** Public (or Unlisted for a soft launch).
- **Regions:** All regions.
- **Pricing:** Free.

## Keeping this file current

When a PR adds a permission, host permission, stored data or a network call:

1. add the justification row above (and to the README permissions table),
2. update [`privacy.md`](privacy.md) and its "Last updated" date,
3. re-check the data-usage answers.

The dashboard re-asks justifications on the next upload whenever the manifest's permissions change.
