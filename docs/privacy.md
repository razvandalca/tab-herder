---
title: Tab Herder privacy policy
permalink: /privacy/
---

# Tab Herder privacy policy

_Last updated: 15 November 2026_

Tab Herder is a Chrome extension that organises your tabs into Chrome's native tab groups, cleans up
duplicate and inactive tabs, and saves groups or windows as sessions. This page explains what data it
handles and where that data goes.

**Short version: Tab Herder has no server, no accounts, no analytics and no telemetry. It does not
send, sell or share your data with anyone. Everything it stores stays in your browser's own extension
storage.**

## What Tab Herder reads

To do its job the extension reads, inside your browser:

- **Tab and tab group information** — the URL, title, favicon URL, pinned/audible/active state and
  window of each open tab, and the title, colour and collapsed state of each tab group. This is used
  to match your grouping rules, find duplicates, decide which tabs are inactive, and show the tab list
  and search in the popup and side panel.
- **Page content, only if you opt in** — if you turn on **Never touch tabs with unsaved form input** or
  **Group by content**, Chrome will first ask you to grant an extra permission. Only then does Tab
  Herder add a small script to web pages. That script:
  - records a yes/no flag for "the user has typed into a form on this page" (it never reads or stores
    what you typed), and
  - reads the page's `<meta name="description">` (or `og:description`), truncated to 500 characters.

  It answers only Tab Herder's own background service worker. Turning both options off removes the
  script and gives the permission back.
- **Incognito tabs** are ignored unless you both enable **Include incognito tabs** in Tab Herder's
  settings and allow the extension in incognito on `chrome://extensions`.

## What Tab Herder stores, and where

All data is kept in Chrome's extension storage (`chrome.storage`) on your device:

| Storage area | What is in it | How long |
|---|---|---|
| `chrome.storage.sync` | Your settings and grouping rules (group names, colours, match patterns, cleanup options, allowlisted domains). | Until you change them or uninstall. |
| `chrome.storage.local` | Saved sessions (tab URLs, titles, favicon URLs, group names and colours), autosave snapshots if you turn them on (tab URLs, titles, pinned state and group names/colours of every non-incognito window; no favicons; only the last few you choose to keep, 5 by default), the "Recently cleaned" list (the last 100 tabs the extension closed, so you can restore them), and per-day counts of tabs cleanup closed and discarded. | Until you delete them or uninstall; the per-day counts are kept for 90 days. |
| `chrome.storage.local` (`insights`) | Aggregate numbers for the **Insights** tab on the options page, per day: the min/average/max number of open tabs, base domain names (for example `github.com`, top 30) with how many tabs were open on them, and tab group titles (top 15) with the largest size each reached. No URLs, page titles or browsing history; incognito tabs are never counted. You can pause collection or clear it from the Insights tab. | 90 days, then deleted automatically. |
| `chrome.storage.session` | Short-lived bookkeeping: which groups the extension created, tabs you moved by hand, and when tabs and groups were last active. | Cleared when the browser closes. |

`chrome.storage.sync` is synchronised between your own Chrome profiles **by Chrome Sync**, only if you
have Chrome Sync turned on. That transfer is done by Google Chrome under
[Google's privacy policy](https://policies.google.com/privacy); Tab Herder never sees or controls it.
Only settings and rules are synced — never your tabs, sessions or browsing history.

Uninstalling the extension deletes all of the above.

## What leaves your browser

Nothing is sent by Tab Herder to its developer or to any third party. The extension makes no network
requests of its own and loads no remote code.

The only network activity related to the extension is ordinary browser behaviour:

- the popup shows each tab's favicon using the image address the website itself provided, which the
  browser normally serves from its cache;
- restoring a saved session or a recently cleaned tab opens those web pages, just as if you had
  opened them yourself.

**Export** (on the Import / Export tab) writes a JSON file to a location you choose; **Import** reads a
file you pick. Those files are handled only on your device.

## What Tab Herder does not do

- No analytics, crash reporting, advertising or tracking of any kind.
- No selling or transferring of user data to third parties.
- No use of data for purposes unrelated to managing your tabs, and no use for creditworthiness or
  lending decisions.
- No remote code: all code ships inside the extension package.

## Children

Tab Herder does not collect personal information from anyone, including children.

## Changes

If this policy changes, the new version will be published at this address and in the extension's
source repository, with a new "Last updated" date. A change that adds any data collection would be
announced in the release notes before it ships.

## Contact

Questions or concerns: open an issue at
[github.com/razvandalca/tab-herder/issues](https://github.com/razvandalca/tab-herder/issues).
The full source code is public in the same repository.
