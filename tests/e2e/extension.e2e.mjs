// End-to-end smoke test: loads dist/ into Chromium (Playwright), opens fake pages for several
// domains via request interception, and exercises grouping, rules, overrides, duplicates,
// cleanup, sessions, group actions and import. Run: bun run build && bun run e2e
// (needs: bunx playwright install chromium)
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
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

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
  route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>${title}</title><meta name="description" content="Page on ${url.hostname}"><h1>${title}</h1><form><input id="f"></form>` });
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
const tabsOf = async (title) => { const gs = await groups(); const g = gs.find((x) => x.title === title); if (!g) return null; return (await tabs()).filter((t) => t.groupId === g.id); };

const open = async (url) => { const p = await context.newPage(); await p.goto(url); return p; };
const urls = [
  'https://github.com/a', 'https://docs.github.com/b', 'https://stackoverflow.com/q/1',
  'https://www.youtube.com/watch?v=1', 'https://youtube.com/watch?v=2',
  'https://example.com/x?utm_source=1&b=2', 'https://example.com/x?b=2#frag',
];
for (const u of urls) await open(u);
await sleep(500);

// 1. Group now by domain
let r = await send({ type: 'groupNow' });
check(r.ok, `groupNow responds ok (${JSON.stringify(r)})`);
let gs = await groups();
const titles = gs.map((g) => g.title).sort();
check(JSON.stringify(titles) === JSON.stringify(['example.com', 'github.com', 'youtube.com']), `domain groups created: ${titles}`);
check((await tabsOf('github.com'))?.length === 2, 'github.com group has 2 tabs (subdomains merged)');
check((await tabsOf('youtube.com'))?.length === 2, 'youtube.com group has 2 tabs (www merged)');
const so = (await tabs()).find((t) => t.url.includes('stackoverflow'));
check(so.groupId === -1, 'single stackoverflow tab not grouped (minGroupSize 2)');
const extTab = (await tabs()).find((t) => t.url.startsWith('chrome-extension'));
check(extTab.groupId === -1, 'extension page not grouped');

// 2. Rules take precedence and regroup managed groups
await api(() => chrome.storage.sync.set({ rules: [
  { id: 'r1', name: 'Dev', matchType: 'domain', pattern: 'github.com', color: 'blue', enabled: true },
  { id: 'r2', name: 'Dev', matchType: 'domain', pattern: 'stackoverflow.com', color: 'blue', enabled: true },
  { id: 'r3', name: 'Video', matchType: 'glob', pattern: '*://*.youtube.com/*', color: 'red', enabled: true, autoCloseMinutes: 1 },
] }));
await sleep(200);
r = await send({ type: 'groupNow' });
gs = await groups();
const dev = gs.find((g) => g.title === 'Dev');
check(dev && dev.color === 'blue' && (await tabsOf('Dev')).length === 3, `Dev rule group has 3 tabs, blue (${JSON.stringify(gs.map((g) => [g.title, g.color]))})`);
check(!gs.find((g) => g.title === 'github.com'), 'old github.com managed group gone');
check(gs.find((g) => g.title === 'Video')?.color === 'red', 'Video glob rule group is red');

// 3. Manual override: user pulls a tab out of Dev -> never regrouped
const pulled = (await tabsOf('Dev'))[0];
await api((id) => chrome.tabs.ungroup(id), pulled.id);
await sleep(400);
await send({ type: 'groupNow' });
check((await tabs()).find((t) => t.id === pulled.id).groupId === -1, 'manually ungrouped tab stays ungrouped after Group now');

// 4. Duplicates
r = await send({ type: 'closeDuplicates' });
check(r.ok && r.result === 1, `closeDuplicates closed 1 (${JSON.stringify(r)})`);
check((await tabs()).filter((t) => t.url.includes('example.com')).length === 1, 'one example.com tab remains');
let local = await api(() => chrome.storage.local.get(null));
check(local.recentlyCleaned?.length === 1 && local.recentlyCleaned[0].reason === 'duplicate', 'recently cleaned has the duplicate');
let stats = await send({ type: 'getStats' });
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
check(gist.groupId === (await groups()).find((g) => g.title === 'Dev')?.id, 'auto mode put new gist tab into Dev group');

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
check(newGroups.some((g) => g.title === 'Dev' && g.color === 'blue') && newGroups.some((g) => g.title === 'Video' && g.color === 'red'), `restored groups keep names/colours: ${JSON.stringify(newGroups.map((g) => [g.title, g.color]))}`);
await api((id) => chrome.windows.remove(id), newWin.id);
await sleep(500);

// 8. Group actions
const video = (await groups()).find((g) => g.title === 'Video' && g.windowId === win.id);
r = await send({ type: 'renameGroup', groupId: video.id, title: 'Vids' });
r = await send({ type: 'recolorGroup', groupId: video.id, color: 'green' });
let v = (await groups()).find((g) => g.id === video.id);
check(v.title === 'Vids' && v.color === 'green', 'rename + recolour');
r = await send({ type: 'collapseAll', windowId: win.id, collapsed: true });
check((await groups()).filter((g) => g.windowId === win.id).every((g) => g.collapsed), 'collapse all');
r = await send({ type: 'moveGroupToNewWindow', groupId: video.id });
await sleep(800);
v = (await groups()).find((g) => g.id === video.id);
check(v && v.windowId !== win.id && (await tabs()).filter((t) => t.groupId === video.id).length === 2, 'move group to new window keeps its tabs');
r = await send({ type: 'saveAndCloseGroup', groupId: video.id, name: 'Vids session' });
await sleep(300);
check(!(await groups()).find((g) => g.id === video.id), 'save & close removed the group');
local = await api(() => chrome.storage.local.get(null));
check(local.sessions.some((s) => s.name === 'Vids session' && s.kind === 'group'), 'group session saved');

// 9. Cleanup: inactivity discard + allowlist + per-group auto-close
await api(() => chrome.storage.sync.set({ settings: { mode: 'manual', cleanup: { enabled: true, intervalMinutes: 15, inactiveHours: 0.0001, inactiveAction: 'discard', closeDuplicates: true, allowlist: ['stackoverflow.com'], detectUnsavedForms: false } } }));
await sleep(1500);
r = await send({ type: 'cleanupNow' });
check(r.ok && r.result.discarded >= 2, `cleanupNow discarded ${r.result?.discarded}`);
const after = await tabs();
check(after.find((t) => t.url.includes('stackoverflow')).discarded === false, 'allowlisted tab not discarded');
check(after.filter((t) => t.active).every((t) => !t.discarded), 'active tabs not discarded');
const gh = after.filter((t) => t.url.includes('github.com'));
console.log('github tabs:', JSON.stringify(gh.map((t) => [t.url, t.active, t.discarded])));
check(gh.filter((t) => !t.active).every((t) => t.discarded), 'inactive (non-active) github tabs discarded');

// 10. Import/export round trip
r = await send({ type: 'importData', rulesMode: 'append', data: { version: 1, exportedAt: 1, settings: { rules: [{ id: 'imp', name: 'Imported', matchType: 'title', pattern: 'zzz', color: 'auto', enabled: true }] }, sessions: [{ id: 'sx', name: 'Imp', createdAt: 1, kind: 'window', groups: [], ungrouped: [{ url: 'https://a.com', title: 'a', pinned: false }] }] } });
const sync = await api(() => chrome.storage.sync.get(null));
check(r.ok && sync.rules.length === 4 && sync.rules.at(-1).id === 'imp', `import appended rule (${sync.rules?.length} rules)`);

// 10b. Snooze: a group wakes via the alarm with title/colour; a tab wakes now; cancel forgets
const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(150); } return false; };
const snoozedList = async () => (await api(() => chrome.storage.local.get('snoozed'))).snoozed ?? [];
const pa = await open('https://snooze-a.com/1');
const pb = await open('https://snooze-a.com/2');
await sleep(300);
const snzTabs = (await tabs()).filter((t) => t.url.includes('snooze-a.com'));
const snzGroup = await api((ids) => chrome.tabs.group({ tabIds: ids }), snzTabs.map((t) => t.id));
await api((id) => chrome.tabGroups.update(id, { title: 'Later', color: 'purple' }), snzGroup);
r = await send({ type: 'snoozeGroup', groupId: snzGroup, wakeAt: Date.now() + 3000 });
await sleep(400);
check(r.ok && r.result.kind === 'group', `snoozeGroup ok (${JSON.stringify(r).slice(0, 120)})`);
check(!(await tabs()).some((t) => t.url.includes('snooze-a.com')), 'snoozed group tabs closed');
check((await snoozedList()).length === 1, 'snoozed group stored');
const alarm = await api(() => chrome.alarms.get('tab-herder:snooze'));
check(!!alarm, 'snooze alarm scheduled');
await waitFor(async () => (await tabs()).filter((t) => t.url.includes('snooze-a.com') && t.groupId !== -1).length === 2, 8000);
const woke = (await groups()).find((g) => g.title === 'Later');
check(woke && woke.color === 'purple' && (await tabs()).filter((t) => t.groupId === woke.id).length === 2, `group woke by alarm with title/colour (${JSON.stringify(woke)})`);
check((await snoozedList()).length === 0, 'woken group removed from storage');
check(!(await api(() => chrome.alarms.get('tab-herder:snooze'))), 'snooze alarm cleared when nothing is snoozed');
void pa; void pb;

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
check(r.ok && (await waitFor(async () => (await tabs()).some((t) => t.url.includes('snooze-b.com')))), 'wake now reopened the tab');
snzTab = (await tabs()).find((t) => t.url.includes('snooze-b.com'));
await send({ type: 'snoozeTab', tabId: snzTab.id, wakeAt: Date.now() + 86_400_000 });
[snzItem] = await snoozedList();
r = await send({ type: 'cancelSnoozed', id: snzItem.id });
await sleep(300);
check(r.ok && (await snoozedList()).length === 0 && !(await tabs()).some((t) => t.url.includes('snooze-b.com')), 'cancel forgets the snoozed tab');
// Leave one snoozed so the popup screenshot shows the section.
await open('https://snooze-c.com/');
await waitFor(async () => (await tabs()).some((t) => t.url.includes('snooze-c.com')));
await send({ type: 'snoozeTab', tabId: (await tabs()).find((t) => t.url.includes('snooze-c.com')).id, wakeAt: Date.now() + 86_400_000 });

// 11. Screenshots of popup and options
const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 580 });
await popup.goto(`chrome-extension://${extId}/src/popup/index.html`);
await sleep(600);
await popup.screenshot({ path: join(OUT, 'popup.png') });
check(await popup.getByRole('list', { name: 'Snoozed tabs and groups' }).isVisible(), 'popup lists snoozed items');
await popup.getByText('Other windows').click(); await sleep(200);
await popup.getByRole('button', { name: /^Actions for/ }).first().click();
await popup.getByRole('menuitem', { name: 'Snooze…' }).click();
await sleep(200);
await popup.screenshot({ path: join(OUT, 'popup-snooze.png') });
await popup.fill('input[type=search]', 'git');
await sleep(200);
await popup.screenshot({ path: join(OUT, 'popup-search.png') });
const errors = [];
popup.on('pageerror', (e) => errors.push(e.message));
await ext.goto(`chrome-extension://${extId}/src/options/index.html#rules`);
await sleep(500);
await ext.screenshot({ path: join(OUT, 'options-rules.png'), fullPage: true });
await ext.goto(`chrome-extension://${extId}/src/options/index.html#cleanup`);
await sleep(500);
await ext.screenshot({ path: join(OUT, 'options-cleanup.png'), fullPage: true });
check(errors.length === 0, `no page errors in popup (${errors.join('; ')})`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
await context.close();
rmSync(profile, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
