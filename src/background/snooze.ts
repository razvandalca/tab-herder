// Snooze: close a tab or group now, reopen it at a chosen time. Items are kept in
// chrome.storage.local; one alarm (SNOOZE_ALARM) is always set for the earliest wake time,
// and anything overdue (e.g. while Chrome was closed) is woken on startup.
import { dueItems, nextWakeTime, validateWakeTime, type SnoozedItem } from '@/core/snooze';
import { newId } from '@/shared/defaults';
import { SNOOZE_ALARM, getSnoozed, patchSnoozed } from '@/shared/snoozeStore';
import { NO_GROUP } from '@/shared/types';
import { activeTab, allGroups, allTabs, quietly, snapshotTab, tuple } from './tabs';
import { openSession, snapshotGroup } from './sessions';
import { isSavable as savable, toSavedTab as toSaved } from '@/core/sessions';
import { closeTabsDiscardingGroups } from './groupActions';
import { markPendingMoves } from './overrides';

/** Snoozes one tab (the active tab of the focused window when tabId is omitted). */
export async function snoozeTab(tabId: number | undefined, wakeAt: number): Promise<SnoozedItem> {
  assertWakeTime(wakeAt);
  const tab = tabId === undefined ? await activeTab() : snapshotTab(await chrome.tabs.get(tabId));
  if (!tab) throw new Error('No tab to snooze');
  if (tab.incognito) throw new Error("Incognito tabs can't be snoozed");
  if (!savable(tab)) throw new Error("This page can't be reopened later, so it can't be snoozed");
  let group: SnoozedItem['group'];
  if (tab.groupId !== NO_GROUP) {
    const g = await quietly(chrome.tabGroups.get(tab.groupId));
    if (g)
      group = { title: g.title ?? '', color: g.color as NonNullable<SnoozedItem['group']>['color'], collapsed: false };
  }
  const item: SnoozedItem = { id: newId(), kind: 'tab', snoozedAt: Date.now(), wakeAt, group, tabs: [toSaved(tab)] };
  await store(item);
  await closeTabsDiscardingGroups([tab]);
  return item;
}

/** Snoozes a whole group; it reopens with the same title and colour. */
export async function snoozeGroup(groupId: number, wakeAt: number): Promise<SnoozedItem> {
  assertWakeTime(wakeAt);
  const tabs = await allTabs({ groupId });
  if (tabs.some((t) => t.incognito)) throw new Error("Incognito groups can't be snoozed");
  const saved = await snapshotGroup(groupId);
  if (!saved.tabs.length) throw new Error('Nothing to snooze: no http(s) tabs in this group');
  const item: SnoozedItem = {
    id: newId(),
    kind: 'group',
    snoozedAt: Date.now(),
    wakeAt,
    group: { title: saved.title, color: saved.color, collapsed: saved.collapsed },
    tabs: saved.tabs,
  };
  await store(item);
  await closeTabsDiscardingGroups(tabs);
  return item;
}

/** Reopens one item now. */
export async function wakeSnoozed(id: string): Promise<void> {
  const [item] = await take((items) => items.filter((i) => i.id === id));
  if (!item) throw new Error('Snoozed item not found');
  await reopenOrRestore([item], true);
}

/** Forgets an item without reopening it. */
export async function cancelSnoozed(id: string): Promise<void> {
  await patchSnoozed((items) => items.filter((i) => i.id !== id));
  await ensureSnoozeAlarm();
}

/** Wakes everything that is due (alarm, startup). */
export async function wakeDue(now = Date.now()): Promise<number> {
  const due = await take((items) => dueItems(items, now));
  await reopenOrRestore(due, false);
  return due.length;
}

/** Keeps a single alarm set for the earliest wake time (cleared when nothing is snoozed). */
export async function ensureSnoozeAlarm(): Promise<void> {
  const next = nextWakeTime(await getSnoozed());
  if (next === null) {
    await chrome.alarms.clear(SNOOZE_ALARM);
    return;
  }
  const existing = await chrome.alarms.get(SNOOZE_ALARM);
  if (existing?.scheduledTime === next) return;
  // An overdue item is woken by wakeDue; the floor just keeps the alarm valid.
  await chrome.alarms.create(SNOOZE_ALARM, { when: Math.max(next, Date.now() + 1000) });
}

/** Runs on browser startup/install: reopen anything that came due while Chrome was closed. */
export async function initSnooze(): Promise<void> {
  await wakeDue();
  await ensureSnoozeAlarm();
}

// ---- internals -----------------------------------------------------------------

function assertWakeTime(wakeAt: number): void {
  const err = validateWakeTime(wakeAt, Date.now());
  if (err) throw new Error(err);
}

async function store(item: SnoozedItem): Promise<void> {
  await patchSnoozed((items) => [...items, item]);
  await ensureSnoozeAlarm();
}

/** Atomically removes and returns the selected items, so an alarm and startup can't both wake one. */
async function take(select: (items: SnoozedItem[]) => SnoozedItem[]): Promise<SnoozedItem[]> {
  let taken: SnoozedItem[] = [];
  await patchSnoozed((items) => {
    taken = select(items);
    const ids = new Set(taken.map((i) => i.id));
    return items.filter((i) => !ids.has(i.id));
  });
  return taken;
}

async function reopenOrRestore(items: SnoozedItem[], focus: boolean): Promise<void> {
  const failed: SnoozedItem[] = [];
  for (const item of items) {
    try {
      await reopen(item, focus);
    } catch (e) {
      console.warn('[tab-herder] snooze wake failed', e);
      failed.push(item);
    }
  }
  if (failed.length) await patchSnoozed((list) => [...list, ...failed]);
  await ensureSnoozeAlarm();
  if (failed.length && focus) throw new Error('Could not reopen the snoozed tabs');
}

/** A normal (non-incognito) window to reopen into: the focused one, else any. */
async function targetWindowId(): Promise<number | undefined> {
  const wins = (await quietly(chrome.windows.getAll({ windowTypes: ['normal'] }))) ?? [];
  const usable = wins.filter((w) => !w.incognito && w.id !== undefined);
  return (usable.find((w) => w.focused) ?? usable[0])?.id;
}

async function reopen(item: SnoozedItem, focus: boolean): Promise<void> {
  if (!item.tabs.length) return;
  const windowId = await targetWindowId();
  const group = item.group ? { ...item.group, tabs: item.tabs } : null;
  if (windowId === undefined) {
    // No window open (e.g. Chrome running in the background): session restore opens one.
    await openSession({
      id: item.id,
      name: '',
      createdAt: item.snoozedAt,
      kind: group ? 'group' : 'window',
      groups: group ? [group] : [],
      ungrouped: group ? [] : item.tabs,
    });
    return;
  }
  const ids: number[] = [];
  for (const [i, t] of item.tabs.entries()) {
    const tab = await chrome.tabs.create({ windowId, url: t.url, pinned: t.pinned, active: focus && i === 0 });
    if (tab.id !== undefined) ids.push(tab.id);
  }
  if (focus) await quietly(chrome.windows.update(windowId, { focused: true }));
  const unpinned = ids.filter((_, i) => !item.tabs[i]!.pinned);
  if (!group || !unpinned.length) return;
  await markPendingMoves(unpinned);
  // A lone tab rejoins its old group if one with that title is still open; a group always comes back whole.
  const existing =
    item.kind === 'tab' && group.title
      ? (await allGroups({ windowId })).find((g) => g.title.toLowerCase() === group.title.toLowerCase())
      : undefined;
  if (existing) {
    await quietly(chrome.tabs.group({ tabIds: tuple(unpinned), groupId: existing.id }));
    return;
  }
  const gid = await quietly(chrome.tabs.group({ tabIds: tuple(unpinned), createProperties: { windowId } }));
  if (gid !== undefined) {
    await quietly(chrome.tabGroups.update(gid, { title: group.title, color: group.color }));
    if (group.collapsed && !focus) await quietly(chrome.tabGroups.update(gid, { collapsed: true }));
  }
}
