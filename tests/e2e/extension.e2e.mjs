// End-to-end smoke test: loads dist/ into Chromium (Playwright), opens fake pages for several
// domains via request interception, and exercises grouping, rules, overrides, duplicates,
// cleanup, sessions, group actions and import. Run: bun run build && bun run e2e
// (needs: bunx playwright install chromium). Runs in CI as the "e2e" job in .github/workflows/ci.yml.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const EXT = fileURLToPath(new URL('../../dist', import.meta.url));
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), 'th-shots-'));
const profile = mkdtempSync(join(tmpdir(), 'th-profile-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1200, height: 800 },
});
// Serve fake pages for any domain so no network is needed.
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.protocol.startsWith('chrome')) return route.continue();
  const title = `${url.hostname}${url.pathname}`;
  route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>${title}</title><meta name="description" content="Page on ${url.hostname}"><h1>${title}</h1><form><input id="f"></form>`,
  });
});

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
console.log('extension id', extId, '| screenshots ->', OUT);

const ext = await context.newPage();
await ext.goto(`chrome-extension://${extId}/src/options/index.html`);
const api = (fn, ...args) => ext.evaluate(fn, ...args);
const send = (req) => api((r) => chrome.runtime.sendMessage(r), req);
const tabs = () => api(() => chrome.tabs.query({}));
const groups = () => api(() => chrome.tabGroups.query({}));
const tabsOf = async (title) => {
  const gs = await groups();
  const g = gs.find((x) => x.title === title);
  if (!g) return null;
  return (await tabs()).filter((t) => t.groupId === g.id);
};

const open = async (url) => {
  const p = await context.newPage();
  await p.goto(url);
  return p;
};
const urls = [
  'https://github.com/a',
  'https://docs.github.com/b',
  'https://stackoverflow.com/q/1',
  'https://www.youtube.com/watch?v=1',
  'https://youtube.com/watch?v=2',
  'https://example.com/x?utm_source=1&b=2',
  'https://example.com/x?b=2#frag',
];
for (const u of urls) await open(u);
await sleep(500);

// 1. Group now by domain
let r = await send({ type: 'groupNow' });
check(r.ok, `groupNow responds ok (${JSON.stringify(r)})`);
let gs = await groups();
const titles = gs.map((g) => g.title).sort();
check(
  JSON.stringify(titles) === JSON.stringify(['example.com', 'github.com', 'youtube.com']),
  `domain groups created: ${titles}`,
);
check((await tabsOf('github.com'))?.length === 2, 'github.com group has 2 tabs (subdomains merged)');
check((await tabsOf('youtube.com'))?.length === 2, 'youtube.com group has 2 tabs (www merged)');
const so = (await tabs()).find((t) => t.url.includes('stackoverflow'));
check(so.groupId === -1, 'single stackoverflow tab not grouped (minGroupSize 2)');
const extTab = (await tabs()).find((t) => t.url.startsWith('chrome-extension'));
check(extTab.groupId === -1, 'extension page not grouped');

// 2. Rules take precedence and regroup managed groups
await api(() =>
  chrome.storage.sync.set({
    rules: [
      { id: 'r1', name: 'Dev', matchType: 'domain', pattern: 'github.com', color: 'blue', enabled: true },
      { id: 'r2', name: 'Dev', matchType: 'domain', pattern: 'stackoverflow.com', color: 'blue', enabled: true },
      {
        id: 'r3',
        name: 'Video',
        matchType: 'glob',
        pattern: '*://*.youtube.com/*',
        color: 'red',
        enabled: true,
        autoCloseMinutes: 1,
      },
    ],
  }),
);
await sleep(200);
r = await send({ type: 'groupNow' });
gs = await groups();
const dev = gs.find((g) => g.title === 'Dev');
check(
  dev && dev.color === 'blue' && (await tabsOf('Dev')).length === 3,
  `Dev rule group has 3 tabs, blue (${JSON.stringify(gs.map((g) => [g.title, g.color]))})`,
);
check(!gs.find((g) => g.title === 'github.com'), 'old github.com managed group gone');
check(gs.find((g) => g.title === 'Video')?.color === 'red', 'Video glob rule group is red');

// 2b. Sorting tabs within a group and groups within a window
const devTabs = async () => (await tabsOf('Dev')).sort((a, b) => a.index - b.index);
const byTitle = (await devTabs()).map((t) => t.title).sort((a, b) => a.localeCompare(b));
r = await send({ type: 'sortGroupTabs', groupId: dev.id, key: 'title' });
await sleep(300);
const sortedDev = await devTabs();
check(
  r.ok && JSON.stringify(sortedDev.map((t) => t.title)) === JSON.stringify(byTitle),
  `sort by title reorders Dev tabs: ${sortedDev.map((t) => t.title)}`,
);
await api(
  (id) => chrome.tabs.move(id, { index: -1 }),
  (await tabs()).find((t) => t.url.startsWith('chrome-extension')).id,
);
const win0 = (await api(() => chrome.windows.getCurrent())).id;
const groupOrder = async () => {
  const ts = await tabs();
  const first = (g) => Math.min(...ts.filter((t) => t.groupId === g.id).map((t) => t.index));
  return (await groups())
    .filter((g) => g.windowId === win0)
    .sort((a, b) => first(a) - first(b))
    .map((g) => g.title);
};
r = await send({ type: 'sortGroups', windowId: win0, key: 'size' });
await sleep(300);
check(r.ok && (await groupOrder())[0] === 'Dev', `sort groups by size puts Dev (3 tabs) first: ${await groupOrder()}`);
r = await send({ type: 'sortGroups', windowId: win0, key: 'name' });
await sleep(300);
const names = await groupOrder();
check(
  r.ok &&
    JSON.stringify(names) ===
      JSON.stringify([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))),
  `sort groups by name: ${names}`,
);
check(
  (await tabs()).find((t) => t.url.startsWith('chrome-extension')).index === (await tabs()).length - 1,
  'ungrouped tab at the end stays at the end',
);
check((await tabsOf('Dev')).length === 3, 'Dev keeps its 3 tabs after sorting');
const sess = await api(() => chrome.storage.session.get('overrides'));
check(
  Object.keys(sess.overrides ?? {}).length === 0,
  `sorting recorded no manual overrides (${JSON.stringify(sess.overrides)})`,
);

// 3. Manual override: user pulls a tab out of Dev -> never regrouped
const pulled = (await tabsOf('Dev'))[0];
await api((id) => chrome.tabs.ungroup(id), pulled.id);
await sleep(400);
await send({ type: 'groupNow' });
check(
  (await tabs()).find((t) => t.id === pulled.id).groupId === -1,
  'manually ungrouped tab stays ungrouped after Group now',
);

// 4. Duplicates
r = await send({ type: 'closeDuplicates' });
check(r.ok && r.result === 1, `closeDuplicates closed 1 (${JSON.stringify(r)})`);
check((await tabs()).filter((t) => t.url.includes('example.com')).length === 1, 'one example.com tab remains');
let local = await api(() => chrome.storage.local.get(null));
check(
  local.recentlyCleaned?.length === 1 && local.recentlyCleaned[0].reason === 'duplicate',
  'recently cleaned has the duplicate',
);
const stats = await send({ type: 'getStats' });
check(stats.ok && stats.result.cleanedThisWeek === 1, `stats cleanedThisWeek=1 (${JSON.stringify(stats)})`);

// 5. Restore cleaned
r = await send({ type: 'restoreCleaned', id: local.recentlyCleaned[0].id });
await sleep(500);
check(r.ok && (await tabs()).filter((t) => t.url.includes('example.com')).length === 2, 'restored the cleaned tab');
local = await api(() => chrome.storage.local.get(null));
check(local.recentlyCleaned.length === 0, 'restore removes entry from recently cleaned');

// 6. Auto mode groups a new tab after load
await api(() => chrome.storage.sync.set({ settings: { mode: 'auto' } }));
await sleep(200);
await open('https://gist.github.com/new');
await sleep(1800);
const gist = (await tabs()).find((t) => t.url.includes('gist.github'));
check(
  gist.groupId === (await groups()).find((g) => g.title === 'Dev')?.id,
  'auto mode put new gist tab into Dev group',
);

// 7. Sessions: save window, restore into new window
const win = await api(() => chrome.windows.getCurrent());
r = await send({ type: 'saveSession', kind: 'window', windowId: win.id, name: 'E2E' });
check(r.ok && r.result.groups.length >= 2, `saved session with ${r.result?.groups?.length} groups`);
const before = (await api(() => chrome.windows.getAll())).length;
r = await send({ type: 'restoreSession', id: r.result.id });
await sleep(1500);
const wins = await api(() => chrome.windows.getAll());
check(wins.length === before + 1, 'restore opened a new window');
const newWin = wins.find((w) => w.id !== win.id);
const newGroups = (await groups()).filter((g) => g.windowId === newWin.id);
check(
  newGroups.some((g) => g.title === 'Dev' && g.color === 'blue') &&
    newGroups.some((g) => g.title === 'Video' && g.color === 'red'),
  `restored groups keep names/colours: ${JSON.stringify(newGroups.map((g) => [g.title, g.color]))}`,
);
await api((id) => chrome.windows.remove(id), newWin.id);
await sleep(500);

// 7b. Autosave: snapshot all windows, skip when unchanged, prune, restore, delete
await api(() =>
  chrome.storage.sync.set({ settings: { mode: 'manual', autosave: { enabled: true, intervalMinutes: 10, keep: 2 } } }),
);
await sleep(300);
check(!!(await api(() => chrome.alarms.get('tab-herder:autosave'))), 'autosave alarm scheduled when enabled');
r = await send({ type: 'autosaveNow' });
check(r.ok && r.result && r.result.windows.length >= 1, 'autosaveNow created a snapshot');
const firstAuto = r.result;
r = await send({ type: 'autosaveNow' });
check(r.ok && r.result === null, 'unchanged windows are not saved again');
const autosaveTab = await open('https://example.org/autosave');
await sleep(300);
r = await send({ type: 'autosaveNow' });
check(r.ok && r.result, 'a new tab triggers a new snapshot');
await autosaveTab.close();
await sleep(300);
r = await send({ type: 'autosaveNow' });
local = await api(() => chrome.storage.local.get(null));
check(
  local.autosaves.length === 2 && !local.autosaves.some((a) => a.id === firstAuto.id),
  `pruned to keep=2 (${local.autosaves.length})`,
);
check(
  !local.sessions.some((s) => local.autosaves.some((a) => a.id === s.id)) &&
    !JSON.stringify(local.autosaves).includes('favIconUrl'),
  'autosaves kept apart from sessions, no favicons',
);
const winsBeforeList = await api(() => chrome.windows.getAll());
const winsBefore = winsBeforeList.length;
r = await send({ type: 'restoreAutosave', id: local.autosaves[0].id });
await sleep(1500);
const winsAfter = await api(() => chrome.windows.getAll());
check(
  r.ok && winsAfter.length === winsBefore + local.autosaves[0].windows.length,
  'restoring an autosave opens its windows',
);
const restoredWins = winsAfter.filter((w) => !winsBeforeList.some((b) => b.id === w.id));
const restoredGroups = (await groups()).filter((g) => restoredWins.some((w) => w.id === g.windowId));
check(
  restoredGroups.some((g) => g.title === 'Dev' && g.color === 'blue'),
  'autosave restore keeps group names/colours',
);
for (const w of restoredWins) await api((id) => chrome.windows.remove(id), w.id);
await sleep(500);
r = await send({ type: 'deleteAutosave', id: local.autosaves[0].id });
local = await api(() => chrome.storage.local.get(null));
check(r.ok && local.autosaves.length === 1, 'deleteAutosave removes it');
await api(() =>
  chrome.storage.sync.set({ settings: { mode: 'manual', autosave: { enabled: false, intervalMinutes: 10, keep: 2 } } }),
);
await sleep(300);
check(!(await api(() => chrome.alarms.get('tab-herder:autosave'))), 'autosave alarm cleared when disabled');

// 8. Group actions
const video = (await groups()).find((g) => g.title === 'Video' && g.windowId === win.id);
r = await send({ type: 'renameGroup', groupId: video.id, title: 'Vids' });
r = await send({ type: 'recolorGroup', groupId: video.id, color: 'green' });
let v = (await groups()).find((g) => g.id === video.id);
check(v.title === 'Vids' && v.color === 'green', 'rename + recolour');
r = await send({ type: 'collapseAll', windowId: win.id, collapsed: true });
check(
  (await groups()).filter((g) => g.windowId === win.id).every((g) => g.collapsed),
  'collapse all',
);
r = await send({ type: 'moveGroupToNewWindow', groupId: video.id });
await sleep(800);
v = (await groups()).find((g) => g.id === video.id);
check(
  v && v.windowId !== win.id && (await tabs()).filter((t) => t.groupId === video.id).length === 2,
  'move group to new window keeps its tabs',
);
r = await send({ type: 'saveAndCloseGroup', groupId: video.id, name: 'Vids session' });
await sleep(300);
check(!(await groups()).find((g) => g.id === video.id), 'save & close removed the group');
local = await api(() => chrome.storage.local.get(null));
check(
  local.sessions.some((s) => s.name === 'Vids session' && s.kind === 'group'),
  'group session saved',
);

// 8b. Close all groups is undoable (and restorable later from Sessions)
const beforeClose = (await groups())
  .filter((g) => g.windowId === win.id)
  .map((g) => [g.title, g.color])
  .sort();
r = await send({ type: 'closeAllGroups', windowId: win.id });
await sleep(500);
check(
  r.ok && r.result.closed === beforeClose.length && r.result.undo.length === 1,
  `close all returns undo ids (${JSON.stringify(r.result)})`,
);
check((await groups()).filter((g) => g.windowId === win.id).length === 0, 'close all removed the groups');
local = await api(() => chrome.storage.local.get(null));
check(
  local.sessions.some((s) => s.autoSaved && s.id === r.result.undo[0]),
  'closed groups auto-saved as a session',
);
r = await send({ type: 'undoClose', ids: r.result.undo });
await sleep(1500);
const afterUndo = (await groups())
  .filter((g) => g.windowId === win.id)
  .map((g) => [g.title, g.color])
  .sort();
check(
  r.ok && JSON.stringify(afterUndo) === JSON.stringify(beforeClose),
  `undo restored groups in the same window: ${JSON.stringify(afterUndo)}`,
);
local = await api(() => chrome.storage.local.get(null));
check(!local.sessions.some((s) => s.autoSaved), 'undo removes the auto-saved entry');
const devGroup = (await groups()).find((g) => g.title === 'Dev' && g.windowId === win.id);
r = await send({ type: 'closeGroup', groupId: devGroup.id });
await sleep(300);
check(
  r.ok && r.result.undo.length === 1 && !(await groups()).some((g) => g.title === 'Dev'),
  'close group is recorded for undo',
);
r = await send({ type: 'undoClose', ids: r.result.undo });
await sleep(1500);
check(
  (await groups()).some((g) => g.title === 'Dev' && g.color === 'blue' && g.windowId === win.id),
  'undo close group restores title/colour',
);

// 9. Cleanup: inactivity discard + allowlist + per-group auto-close
await api(() =>
  chrome.storage.sync.set({
    settings: {
      mode: 'manual',
      cleanup: {
        enabled: true,
        intervalMinutes: 15,
        inactiveHours: 0.0001,
        inactiveAction: 'discard',
        closeDuplicates: true,
        allowlist: ['stackoverflow.com'],
        detectUnsavedForms: false,
      },
    },
  }),
);
await sleep(1500);
r = await send({ type: 'cleanupNow' });
check(r.ok && r.result.discarded >= 2, `cleanupNow discarded ${r.result?.discarded}`);
const after = await tabs();
check(after.find((t) => t.url.includes('stackoverflow')).discarded === false, 'allowlisted tab not discarded');
check(
  after.filter((t) => t.active).every((t) => !t.discarded),
  'active tabs not discarded',
);
const gh = after.filter((t) => t.url.includes('github.com'));
console.log('github tabs:', JSON.stringify(gh.map((t) => [t.url, t.active, t.discarded])));
check(
  gh.filter((t) => !t.active).every((t) => t.discarded),
  'inactive (non-active) github tabs discarded',
);

// 10. Import/export round trip
r = await send({
  type: 'importData',
  rulesMode: 'append',
  data: {
    version: 1,
    exportedAt: 1,
    settings: {
      rules: [{ id: 'imp', name: 'Imported', matchType: 'title', pattern: 'zzz', color: 'auto', enabled: true }],
    },
    sessions: [
      {
        id: 'sx',
        name: 'Imp',
        createdAt: 1,
        kind: 'window',
        groups: [],
        ungrouped: [{ url: 'https://a.com', title: 'a', pinned: false }],
      },
    ],
  },
});
const sync = await api(() => chrome.storage.sync.get(null));
check(
  r.ok && sync.rules.length === 4 && sync.rules.at(-1).id === 'imp',
  `import appended rule (${sync.rules?.length} rules)`,
);

// 10b. Rule profiles: create one in the options page, switch from the popup without regrouping
await ext.goto(`chrome-extension://${extId}/src/options/index.html#rules`);
await sleep(400);
await ext.getByRole('button', { name: 'New', exact: true }).click();
await ext.getByLabel('New profile name').fill('Work');
await ext.getByRole('button', { name: 'Create', exact: true }).click();
await sleep(400);
let syncP = await api(() => chrome.storage.sync.get(null));
check(
  syncP.profiles?.list?.length === 2 && syncP.profiles.activeId === 'default' && syncP.rules.length === 4,
  `options page created a second profile (${JSON.stringify(syncP.profiles)})`,
);
const groupsBefore = JSON.stringify((await groups()).map((g) => g.id).sort());
const pop = await context.newPage();
await pop.goto(`chrome-extension://${extId}/src/popup/index.html`);
await sleep(500);
const workId = syncP.profiles.list.find((p) => p.name === 'Work').id;
await pop.getByLabel('Rule profile').selectOption(workId);
await sleep(500);
syncP = await api(() => chrome.storage.sync.get(null));
check(
  syncP.profiles.activeId === workId && syncP.rules.length === 0 && syncP['rules:default:0']?.length === 4,
  'popup switch makes Work active and parks Default rules in a chunk',
);
check(JSON.stringify((await groups()).map((g) => g.id).sort()) === groupsBefore, 'switching profile does not regroup');
await pop.getByLabel('Rule profile').selectOption('default');
await sleep(500);
syncP = await api(() => chrome.storage.sync.get(null));
check(
  syncP.profiles.activeId === 'default' && syncP.rules.length === 4 && !('rules:default:0' in syncP),
  'switching back restores Default rules',
);
await pop.close();
r = await send({
  type: 'importData',
  rulesMode: 'append',
  data: {
    version: 2,
    exportedAt: 1,
    settings: {
      profiles: [
        {
          id: 'ext',
          name: 'Imported profile',
          rules: [{ id: 'x1', name: 'X', matchType: 'domain', pattern: 'x.com', color: 'auto', enabled: true }],
        },
      ],
    },
  },
});
syncP = await api(() => chrome.storage.sync.get(null));
check(
  r.ok && syncP.profiles.list.some((p) => p.id === 'ext' && p.chunks === 1) && syncP.rules.length === 4,
  `version 2 import adds a profile (${JSON.stringify(r)})`,
);

// 10c. Snooze: a group wakes via the alarm with title/colour; a tab wakes now; cancel forgets
const waitFor = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};
const snoozedList = async () => (await api(() => chrome.storage.local.get('snoozed'))).snoozed ?? [];
const pa = await open('https://snooze-a.com/1');
const pb = await open('https://snooze-a.com/2');
await sleep(300);
const snzTabs = (await tabs()).filter((t) => t.url.includes('snooze-a.com'));
const snzGroup = await api(
  (ids) => chrome.tabs.group({ tabIds: ids }),
  snzTabs.map((t) => t.id),
);
await api((id) => chrome.tabGroups.update(id, { title: 'Later', color: 'purple' }), snzGroup);
r = await send({ type: 'snoozeGroup', groupId: snzGroup, wakeAt: Date.now() + 3000 });
await sleep(400);
check(r.ok && r.result.kind === 'group', `snoozeGroup ok (${JSON.stringify(r).slice(0, 120)})`);
check(!(await tabs()).some((t) => t.url.includes('snooze-a.com')), 'snoozed group tabs closed');
check((await snoozedList()).length === 1, 'snoozed group stored');
const alarm = await api(() => chrome.alarms.get('tab-herder:snooze'));
check(!!alarm, 'snooze alarm scheduled');
await waitFor(
  async () => (await tabs()).filter((t) => t.url.includes('snooze-a.com') && t.groupId !== -1).length === 2,
  8000,
);
const woke = (await groups()).find((g) => g.title === 'Later');
check(
  woke && woke.color === 'purple' && (await tabs()).filter((t) => t.groupId === woke.id).length === 2,
  `group woke by alarm with title/colour (${JSON.stringify(woke)})`,
);
check((await snoozedList()).length === 0, 'woken group removed from storage');
check(!(await api(() => chrome.alarms.get('tab-herder:snooze'))), 'snooze alarm cleared when nothing is snoozed');
void pa;
void pb;

await open('https://snooze-b.com/x');
await sleep(300);
let snzTab = (await tabs()).find((t) => t.url.includes('snooze-b.com'));
r = await send({ type: 'snoozeTab', tabId: snzTab.id, wakeAt: Date.now() + 7 * 86_400_000 });
await sleep(300);
check(r.ok && !(await tabs()).some((t) => t.url.includes('snooze-b.com')), 'snoozeTab closed the tab');
r = await send({ type: 'snoozeTab', tabId: extTab.id, wakeAt: Date.now() + 60_000 });
check(!r.ok, 'extension pages cannot be snoozed');
r = await send({ type: 'snoozeTab', tabId: snzTab.id, wakeAt: Date.now() - 1 });
check(!r.ok, 'past wake time rejected');
let [snzItem] = await snoozedList();
r = await send({ type: 'wakeSnoozed', id: snzItem.id });
check(
  r.ok && (await waitFor(async () => (await tabs()).some((t) => t.url.includes('snooze-b.com')))),
  'wake now reopened the tab',
);
snzTab = (await tabs()).find((t) => t.url.includes('snooze-b.com'));
await send({ type: 'snoozeTab', tabId: snzTab.id, wakeAt: Date.now() + 86_400_000 });
[snzItem] = await snoozedList();
r = await send({ type: 'cancelSnoozed', id: snzItem.id });
await sleep(300);
check(
  r.ok && (await snoozedList()).length === 0 && !(await tabs()).some((t) => t.url.includes('snooze-b.com')),
  'cancel forgets the snoozed tab',
);
// Leave one snoozed so the popup screenshot shows the section.
await open('https://snooze-c.com/');
await waitFor(async () => (await tabs()).some((t) => t.url.includes('snooze-c.com')));
await send({
  type: 'snoozeTab',
  tabId: (await tabs()).find((t) => t.url.includes('snooze-c.com')).id,
  wakeAt: Date.now() + 86_400_000,
});

// 11. Screenshots of popup and options
const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 580 });
await popup.goto(`chrome-extension://${extId}/src/popup/index.html`);
await sleep(600);
await popup.screenshot({ path: join(OUT, 'popup.png') });
check(await popup.getByRole('list', { name: 'Snoozed tabs and groups' }).isVisible(), 'popup lists snoozed items');
await popup.getByText('Other windows').click();
await sleep(200);
await popup
  .getByRole('button', { name: /^Actions for/ })
  .first()
  .click();
await popup.getByRole('menuitem', { name: 'Snooze…' }).click();
await sleep(200);
await popup.screenshot({ path: join(OUT, 'popup-snooze.png') });
await popup.fill('input[type=search]', 'git');
await sleep(200);
await popup.screenshot({ path: join(OUT, 'popup-search.png') });
const errors = [];
popup.on('pageerror', (e) => errors.push(e.message));
// Popup toast offers Undo after Close all
// Playwright opens the page in its own window; move it next to the groups so "this window" has some.
await popup.evaluate(async (windowId) => {
  const me = await chrome.tabs.getCurrent();
  await chrome.tabs.move(me.id, { windowId, index: -1 });
  await chrome.tabs.update(me.id, { active: true });
}, win.id);
await popup.reload();
await sleep(600);
const popupWin = await popup.evaluate(async () => (await chrome.windows.getCurrent()).id);
const groupsBeforeUi = (await groups()).filter((g) => g.windowId === popupWin).length;
if (groupsBeforeUi > 0) {
  await popup.getByRole('button', { name: 'Close all', exact: true }).click();
  await popup.getByRole('button', { name: /^Close \d+ groups\?$/ }).click();
  await popup.getByRole('button', { name: 'Undo' }).waitFor({ timeout: 3000 });
  await popup.screenshot({ path: join(OUT, 'popup-undo.png') });
  check((await groups()).filter((g) => g.windowId === popupWin).length === 0, 'popup Close all closed the groups');
  await popup.getByRole('button', { name: 'Undo' }).click();
  await sleep(1500);
  check(
    (await groups()).filter((g) => g.windowId === popupWin).length === groupsBeforeUi,
    'popup Undo restored the groups',
  );
} else
  check(
    false,
    `expected groups in the popup window ${popupWin} (win ${win.id}): ${JSON.stringify((await groups()).map((g) => [g.title, g.windowId]))}`,
  );

// 12. Command palette: `>` switches to commands; keyboard runs them; close-all needs a second Enter
// (the popup tab was moved into `win` above)
await send({ type: 'collapseAll', windowId: win.id, collapsed: false });
await sleep(200);
const search = popup.locator('input[type=search]');
await search.fill('>');
await sleep(150);
check(await popup.locator('[role=listbox][aria-label=Commands]').isVisible(), 'typing > shows the command palette');
await search.fill('> save session Palette');
await sleep(150);
check(
  (await popup.locator('[role=option][aria-selected=true]').textContent())?.includes('Save session “Palette”'),
  'save session parses the name argument',
);
await search.press('Enter');
await sleep(500);
local = await api(() => chrome.storage.local.get(null));
check(
  local.sessions.some((s) => s.name === 'Palette' && s.kind === 'window'),
  'palette saved a named session',
);
check((await search.inputValue()) === '', 'running a command returns to tab search');
await search.fill('> collapse all');
await sleep(150);
await search.press('Enter');
await sleep(400);
check(
  (await groups()).filter((g) => g.windowId === win.id).every((g) => g.collapsed),
  'palette collapse all',
);
const groupsInPopupWin = async () => (await groups()).filter((g) => g.windowId === win.id).length;
const beforePaletteClose = await groupsInPopupWin();
await search.fill('> close all groups');
await sleep(150);
await search.press('Enter');
await sleep(300);
check(
  (await popup.locator('[role=option][aria-selected=true]').textContent())?.includes('Press Enter again'),
  'close all groups asks for confirmation',
);
check((await groupsInPopupWin()) === beforePaletteClose, 'first Enter does not close groups');
await search.press('Escape');
await sleep(100);
check(
  (await search.inputValue()) === '' && !(await popup.locator('[role=listbox][aria-label=Commands]').count()),
  'Esc leaves the palette',
);

// 13. Side panel page: same UI, registered in the manifest, no popup-only button, live updates
const manifest = await api(() => chrome.runtime.getManifest());
check(
  manifest.side_panel?.default_path === 'src/sidepanel/index.html' && manifest.permissions.includes('sidePanel'),
  'manifest declares side panel + sidePanel permission',
);
const panelOpts = await api(() => chrome.sidePanel.getOptions({}));
check(
  panelOpts.enabled !== false && panelOpts.path === 'src/sidepanel/index.html',
  `side panel enabled with default path (${JSON.stringify(panelOpts)})`,
);
check(
  (await popup.locator('button[aria-label="Open in side panel"]').count()) === 1,
  'popup header has an Open in side panel button',
);
const panel = await context.newPage();
panel.on('pageerror', (e) => errors.push(e.message));
await panel.setViewportSize({ width: 320, height: 800 });
await panel.goto(`chrome-extension://${extId}/src/sidepanel/index.html`);
await sleep(600);
check(
  (await panel.locator('body.sidepanel h1', { hasText: 'Tab Herder' }).count()) === 1,
  'side panel page renders the app',
);
check(
  (await panel.locator('button[aria-label="Open in side panel"]').count()) === 0,
  'side panel hides the open-in-side-panel button',
);
const tabStat = async () => Number(await panel.locator('.stat b').first().textContent());
const n0 = await tabStat();
const extra = await open('https://live-update.example.org/');
await sleep(800);
check((await tabStat()) === n0 + 1, `side panel updates live when a tab opens (${n0} -> ${await tabStat()})`);
await extra.close();
await panel.screenshot({ path: join(OUT, 'sidepanel.png') });
await panel.close();
await ext.goto(`chrome-extension://${extId}/src/options/index.html#rules`);
await sleep(500);
await ext.screenshot({ path: join(OUT, 'options-rules.png'), fullPage: true });
await ext.goto(`chrome-extension://${extId}/src/options/index.html#cleanup`);
await sleep(500);
await ext.screenshot({ path: join(OUT, 'options-cleanup.png'), fullPage: true });
await ext.goto(`chrome-extension://${extId}/src/options/index.html#sessions`);
await sleep(500);
check(
  (await ext.locator('[data-testid=autosaves]').textContent()).includes('Autosave – '),
  'Sessions panel lists autosaves',
);
await ext.screenshot({ path: join(OUT, 'options-sessions.png'), fullPage: true });
// 12. Insights: aggregate samples only (no URLs), cleanup split, options tab renders, clear works
const ins = await api(() => chrome.storage.local.get(['insights', 'stats']));
const today = Object.values(ins.insights?.days ?? {})[0];
check(
  today && today.n >= 1 && today.max >= 1,
  `insights sampled open tabs (${JSON.stringify(today && { n: today.n, max: today.max })})`,
);
check(
  today && Object.keys(today.domains).every((d) => !d.includes('/')),
  `insights store domains only: ${Object.keys(today?.domains ?? {})}`,
);
check(!JSON.stringify(ins.insights).includes('https://'), 'insights contain no URLs');
check(
  Object.values(ins.stats.discardedByDay ?? {}).reduce((a, b) => a + b, 0) >= 2,
  `discards counted per day (${JSON.stringify(ins.stats.discardedByDay)})`,
);
const optErrors = [];
ext.on('pageerror', (e) => optErrors.push(e.message));
await ext.goto(`chrome-extension://${extId}/src/options/index.html#insights`);
await sleep(500);
check(
  (await ext.locator('text=Top domains').count()) === 1 && (await ext.locator('.chart svg').count()) === 2,
  'insights tab renders charts',
);
await ext.screenshot({ path: join(OUT, 'options-insights.png'), fullPage: true });
ext.once('dialog', (d) => d.accept());
await ext.click('text=Clear insights data');
await sleep(400);
const cleared = await api(() => chrome.storage.local.get(['insights', 'stats']));
check(
  Object.keys(cleared.insights.days).length === 0 && Object.keys(cleared.stats.discardedByDay).length === 0,
  'clear insights data wipes samples and counters',
);
check(optErrors.length === 0, `no page errors on insights tab (${optErrors.join('; ')})`);
check(errors.length === 0, `no page errors in popup / side panel (${errors.join('; ')})`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
await context.close();
rmSync(profile, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
