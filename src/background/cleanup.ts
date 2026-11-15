import { duplicateTabIds } from '@/core/duplicates';
import { bumpDay } from '@/core/insights';
import { isProtected, planCleanup } from '@/core/cleanup';
import { CLEANUP_ALARM, RECENTLY_CLEANED_MAX, STATS_RETENTION_DAYS, newId } from '@/shared/defaults';
import { getLocal, getSessionState, getSettings, patchLocal } from '@/shared/storage';
import type { CleanReason, CleanedEntry, GroupSnapshot, Settings, TabSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';
import { allGroups, allTabs, currentWindowId, quietly } from './tabs';
import { hasContentPermission, probeTabs } from './contentScripts';
import { markPendingMoves } from './overrides';

export async function ensureCleanupAlarm(settings?: Settings): Promise<void> {
  const s = settings ?? (await getSettings());
  const existing = await chrome.alarms.get(CLEANUP_ALARM);
  if (!s.cleanup.enabled) {
    if (existing) await chrome.alarms.clear(CLEANUP_ALARM);
    return;
  }
  const period = Math.max(1, s.cleanup.intervalMinutes);
  if (!existing || existing.periodInMinutes !== period) {
    await chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: period, delayInMinutes: period });
  }
}

export interface CleanupResult {
  closed: number;
  discarded: number;
}

/** Full cleanup pass (alarm or "Clean up now"). */
export async function runCleanup(opts: { force?: boolean } = {}): Promise<CleanupResult> {
  const settings = await getSettings();
  if (!settings.cleanup.enabled && !opts.force) return { closed: 0, discarded: 0 };
  const [tabs, groups, session] = await Promise.all([allTabs(), allGroups(), getSessionState()]);
  const eligible = tabs.filter((t) => !t.incognito || settings.includeIncognito);
  const now = Date.now();

  const base = { tabs: eligible, groups, settings, now, lastActive: session.lastActive, groupLastActive: session.groupLastActive };
  let plan = planCleanup(base);

  if (settings.cleanup.detectUnsavedForms && (await hasContentPermission())) {
    const candidates = [...plan.discard, ...plan.close.map((c) => c.tabId)];
    const probes = await probeTabs(candidates);
    const dirty = new Set([...probes].filter(([, r]) => r.dirty).map(([id]) => id));
    if (dirty.size) plan = planCleanup({ ...base, dirtyTabIds: dirty });
  }

  const closed = await closeTabs(eligible, groups, plan.close);
  let discarded = 0;
  for (const id of plan.discard) {
    if ((await quietly(chrome.tabs.discard(id))) !== undefined) discarded++;
  }
  await recordDiscarded(discarded);
  return { closed, discarded };
}

/** Closes duplicate tabs only (quick action / shortcut). */
export async function closeDuplicatesNow(): Promise<number> {
  const settings = await getSettings();
  const [tabs, groups] = await Promise.all([allTabs(), allGroups()]);
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const ids = duplicateTabIds(tabs).filter((id) => {
    const t = byId.get(id)!;
    return !(t.pinned || t.audible || (t.incognito && !settings.includeIncognito));
  });
  return closeTabs(tabs, groups, ids.map((tabId) => ({ tabId, reason: 'duplicate' as const })));
}

/** Saves the tabs to "recently cleaned", bumps stats, then closes them. */
export async function closeTabs(
  tabs: TabSnapshot[],
  groups: GroupSnapshot[],
  items: Array<{ tabId: number; reason: CleanReason }>,
): Promise<number> {
  if (!items.length) return 0;
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const entries: CleanedEntry[] = [];
  for (const { tabId, reason } of items) {
    const t = byId.get(tabId);
    if (!t) continue;
    const g = t.groupId !== NO_GROUP ? groupById.get(t.groupId) : undefined;
    entries.push({
      id: newId(),
      url: t.url,
      title: t.title || t.url,
      favIconUrl: t.favIconUrl,
      groupTitle: g?.title,
      groupColor: g?.color,
      closedAt: Date.now(),
      reason,
    });
  }
  await recordCleaned(entries);
  const ids = items.map((i) => i.tabId);
  await quietly(chrome.tabs.remove(ids));
  return ids.length;
}

export async function recordCleaned(entries: CleanedEntry[]): Promise<void> {
  if (!entries.length) return;
  await patchLocal((local) => {
    local.recentlyCleaned = [...entries.reverse(), ...local.recentlyCleaned].slice(0, RECENTLY_CLEANED_MAX);
    local.stats.cleanedByDay = bumpDay(local.stats.cleanedByDay, entries.length, Date.now(), STATS_RETENTION_DAYS);
  });
}

/** Counts tabs discarded by cleanup, per day (for the Insights tab). */
export async function recordDiscarded(count: number): Promise<void> {
  if (!count) return;
  await patchLocal((local) => {
    local.stats.discardedByDay = bumpDay(local.stats.discardedByDay ?? {}, count, Date.now(), STATS_RETENTION_DAYS);
  });
}

/** Reopens a cleaned tab in the current window, joining a group with the same title if one exists. */
export async function restoreCleaned(id: string): Promise<void> {
  const local = await getLocal();
  const entry = local.recentlyCleaned.find((e) => e.id === id);
  if (!entry) throw new Error('Entry not found');
  const windowId = await currentWindowId();
  const tab = await chrome.tabs.create({ url: entry.url, windowId, active: true });
  if (entry.groupTitle && tab.id !== undefined) {
    const groups = await allGroups({ windowId });
    const target = groups.find((g) => g.title.toLowerCase() === entry.groupTitle!.toLowerCase());
    await markPendingMoves([tab.id]);
    if (target) {
      await quietly(chrome.tabs.group({ tabIds: [tab.id], groupId: target.id }));
    } else if (entry.groupColor) {
      const gid = await quietly(chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId } }));
      if (gid !== undefined) await quietly(chrome.tabGroups.update(gid, { title: entry.groupTitle, color: entry.groupColor }));
    }
  }
  await patchLocal((l) => {
    l.recentlyCleaned = l.recentlyCleaned.filter((e) => e.id !== id);
  });
}

export async function clearCleaned(): Promise<void> {
  await patchLocal((l) => {
    l.recentlyCleaned = [];
  });
}

export { isProtected };
