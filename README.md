# Tab Herder

A Chrome extension (Manifest V3) that keeps your tabs in order using Chrome's native tab groups.
It groups tabs by rule or domain, cleans up duplicates and stale tabs safely, and saves groups or
windows as sessions you can restore later. No backend, no accounts, no telemetry: everything lives
in `chrome.storage`.

## Install (unpacked)

```sh
bun install
bun run build        # writes the extension to dist/
```

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick the `dist/` folder.
3. Pin Tab Herder to the toolbar. Click the icon for the popup, right-click it for **Options**.

Requires Chrome 121 or newer. For development, `bun run dev` starts Vite with hot reload for the
popup and options page (load `dist/` the same way).

Other scripts:
- `bun run test` — Vitest unit tests for the rule engine, URL normalisation, duplicates, grouping and cleanup plans.
- `bun run typecheck` — `tsc --noEmit`.
- `bun run e2e` — Playwright smoke test that loads `dist/` into Chromium, opens fake pages for several domains
  and exercises grouping, rules, manual overrides, duplicates, cleanup, sessions and group actions.
  Run `bunx playwright install chromium` once first.
- `bun run icons` — regenerate the PNG icons.
- `bun run package` — builds and zips `dist/` into `release/tab-herder-<version>.zip` for upload to the Chrome Web Store (manifest at the archive root). Bump `version` in `package.json` before each release.
- `bun run screenshots` — generates the five 1280×800 Chrome Web Store screenshots into `release/screenshots/` (needs `dist/` and Playwright Chromium). `bun run icons` also writes the padded 128 px listing icon to `release/store-icon-128.png`.

## Releasing

1. Bump `version` in `package.json` (e.g. `0.2.0`), commit and merge to `main`.
2. Tag that commit and push the tag:
   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The **Release** workflow checks the tag matches `package.json`, runs typecheck and tests, builds
   `tab-herder-<version>.zip` with `bun run package`, and publishes a GitHub Release with the zip
   attached and auto-generated notes. Upload that zip to the Chrome Web Store.

## Permissions

| Permission | Why it is needed |
|---|---|
| `tabs` | Read tab URLs, titles and favicons to match rules, find duplicates and show the tab list; discard inactive tabs. |
| `tabGroups` | Create, rename, recolour, collapse and move tab groups. |
| `storage` | Settings and rules in `chrome.storage.sync`; sessions, snoozed tabs, stats and the "recently cleaned" list in `chrome.storage.local`; short-lived bookkeeping in `chrome.storage.session`. |
| `alarms` | Run the cleanup pass on a schedule and reopen snoozed tabs on time, even though the MV3 service worker is not always running. |
| `contextMenus` | The "Tab Herder" right-click submenu on pages and on the toolbar icon. |
| `scripting` + `<all_urls>` (**optional**) | Only requested, with a Chrome prompt, when you enable **Never touch tabs with unsaved form input** or **Group by content**. It injects a tiny script that watches for typing in forms and reads the page's meta description. Nothing is sent anywhere. Turning both features off releases the permission. |

Keyboard shortcuts (`commands`) need no permission. Incognito tabs are ignored unless you enable
them in settings *and* allow the extension in incognito on `chrome://extensions`.

## Features

### Auto-grouping
- **Modes:** off · group on demand · auto-group new tabs as they load (debounced while pages load).
- **Rules first, domain second.** Rules are checked top to bottom; the first match wins. Tabs that
  match no rule are grouped by domain (subdomains merged by default; toggle in settings).
- **Minimum group size** avoids one-tab groups. Existing groups still accept single tabs.
- **Presets:** Dev, Docs, Social, Video, Shopping, Mail/Calendar, Cloud consoles. Add them from the
  Rules tab; duplicates are skipped.
- **Respects you:** pinned tabs are never touched. A tab you drag into or out of a group by hand is
  remembered and never regrouped. Groups you created yourself are left alone (though tabs may join
  them if the group title matches an assignment). `chrome://` and extension pages are ignored.

### Group actions (popup menu and right-click menu)
Close all tabs · Save & close as a session · Collapse / expand all · Ungroup · Rename · Recolour ·
Move group to a new window.

### Auto-cleanup
- **Duplicates:** same URL after removing the `#fragment` and tracking parameters (`utm_*`, `fbclid`,
  `gclid`, `msclkid`, `mc_cid`, `_ga`, …). The active tab wins, then pinned, then the oldest.
- **Inactive tabs:** after N hours (default 12) they are **discarded** (memory freed, tab stays in
  the strip) or closed, your choice.
- **Per-group auto-close:** a rule can close its whole group after X minutes without activity.
- **Allowlist:** domains that are never closed or discarded.
- **Never** touches pinned tabs, audible tabs, the active tab of each window, or (optionally)
  tabs with unsaved form input.
- Runs on a schedule (default every 15 minutes) and from **Clean up now**.
- Everything closed goes to **Recently cleaned** (last 100) with one-click restore.

### Sessions
Save the current window or a single group under a name, restore it later as a new window with the
original group names and colours. Export and import sessions and rules as JSON (Import / Export tab).

### Snooze
Close a tab or a whole group now and reopen it later: *Later today* (+3 h), *Tonight* (19:00),
*Tomorrow morning* (09:00), *Next week* (Monday 09:00) or a custom date and time. From the popup
("Snooze this tab…", or **Snooze…** in a group's menu) or the right-click menu. Groups come back
with their title and colour; a single tab rejoins its group if one with the same name is open.
Snoozed items are listed in the popup (**Wake now** / **Cancel**, which forgets them) and anything
that came due while Chrome was closed reopens at the next start. Incognito tabs can't be snoozed.

### Popup
Fuzzy search across all open tabs (title and URL, type to filter, click to jump), groups in this
window with tab counts, quick actions (Group now · Clean up · Close duplicates · Save session),
stats (open tabs · groups · tabs cleaned this week) and the recently cleaned list.

### Keyboard shortcuts
| Action | Default |
|---|---|
| Group all tabs now | `Alt+Shift+G` |
| Close the current tab's group | `Alt+Shift+W` |
| Close duplicate tabs | `Alt+Shift+D` |
| Open tab search (popup) | `Alt+Shift+F` |

Remap them at `chrome://extensions/shortcuts`. On macOS, Alt is Option.

### Extras (off by default)
- **Group by content:** a local keyword heuristic classifies tabs into Dev, Docs, Social, Video,
  Shopping, Mail, News, Finance or Research from the title, URL and meta description. No external
  calls. Rules still take precedence.
- **Badge:** open-tab count on the icon, red above a threshold you choose.

## Writing rules

Each rule has a **group name**, a **colour** (or *auto*, derived from the name), a **match type**
and a **pattern**. Optionally an **auto-close** timeout in minutes.

| Match type | Pattern | Matches |
|---|---|---|
| Domain | `github.com` | `github.com` and every subdomain (`gist.github.com`). `*.` and `www.` prefixes are accepted. |
| URL glob | `*://*.github.com/pulls*` | Chrome match-pattern style. `*` in the host matches one or more labels; `*.` also matches the bare domain; `*` in the path matches anything. Scheme and path are optional: `github.com` means any scheme and any path. `*://docs.*/*` matches any host starting with `docs.`. |
| URL regex | `^https://(www\.)?example\.(com\|org)/` | JavaScript regular expression tested against the full URL, case-insensitive. |
| Title keyword | `jira, ticket` | Comma-separated keywords; any one of them in the tab title (case-insensitive). |

Tips:
- Put specific rules above general ones (`mail.google.com` → Mail above `google.com` → Google).
- Use the **Test a URL** box on the Rules tab to see which rule a page would hit.
- Rules sync across your Chrome profiles through `chrome.storage.sync`.

## Export format

```json
{
  "version": 1,
  "exportedAt": 1760000000000,
  "settings": { "mode": "auto", "rules": [ { "id": "…", "name": "Dev", "matchType": "domain", "pattern": "github.com", "color": "blue", "enabled": true } ], "...": "..." },
  "sessions": [ { "id": "…", "name": "Research", "kind": "window", "createdAt": 1760000000000,
                  "groups": [ { "title": "Docs", "color": "cyan", "collapsed": false, "tabs": [ { "url": "…", "title": "…", "pinned": false } ] } ],
                  "ungrouped": [] } ]
}
```

## Project layout

```
manifest.config.ts    MV3 manifest (crxjs)
src/core/             pure logic, no chrome.* calls, fully unit-tested
  rules.ts            rule engine: url + title in, group assignment out
  url.ts              hostname / base domain / URL normalisation
  glob.ts             match-pattern globs
  duplicates.ts       duplicate detection
  grouping.ts         grouping plan for one window
  cleanup.ts          cleanup plan (close / discard)
  fuzzy.ts            popup search
  classify.ts         content heuristic
  snooze.ts           snooze presets and wake-time maths
src/background/       MV3 service worker (stateless; reads state from storage)
src/popup/            popup UI (Preact)
src/options/          options page (Preact)
src/content/          optional probe script (unsaved input, meta description)
src/shared/           types, defaults, presets, storage wrappers, message protocol
tests/core/           Vitest suites
```

## Privacy

Tab Herder never sends data anywhere. There is no server. The optional content script only answers
the extension's own "is there unsaved input / what is the meta description" question.
