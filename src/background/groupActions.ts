import type { GroupColor } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';
import type { CloseResult } from '@/shared/messages';
import { allGroups, allTabs, activeTab, quietly, tuple } from './tabs';
import { markPendingMoves } from './overrides';
import { recordClosedGroups, saveGroupSession } from './sessions';

/**
 * Closes tabs without leaving a "saved group" behind. Chrome saves a group when its tabs are
 * closed, but deletes it when the tabs are ungrouped first, so ungroup, then close.
 * If this would empty a window, a new tab is opened there first so the window survives.
 */
export async function closeTabsDiscardingGroups(tabs: Array<{ id: number; windowId: number }>): Promise<void> {
  if (!tabs.length) return;
  const ids = tabs.map((t) => t.id);
  const closing = new Set(ids);
  for (const windowId of new Set(tabs.map((t) => t.windowId))) {
    const all = await allTabs({ windowId });
    if (all.every((t) => closing.has(t.id))) await quietly(chrome.tabs.create({ windowId, active: true }));
  }
  await markPendingMoves(ids);
  await quietly(chrome.tabs.ungroup(tuple(ids)));
  await quietly(chrome.tabs.remove(ids));
}

/**
 * Closes one group's tabs. Unless `record` is false, the group is first auto-saved (title,
 * colour, tabs) so the close can be undone; `undo` holds the ids to pass to `undoClose`.
 */
export async function closeGroup(groupId: number, record = true): Promise<CloseResult> {
  const tabs = await allTabs({ groupId });
  const undo =
    record && tabs.length ? await recordClosedGroups(tabs, await allGroups({ windowId: tabs[0]!.windowId })) : [];
  await closeTabsDiscardingGroups(tabs);
  return { closed: tabs.length, undo };
}

/** Closes every group (and its tabs) in one window, or in all windows when windowId is omitted. */
export async function closeAllGroups(windowId?: number): Promise<CloseResult> {
  const groups = await allGroups(windowId === undefined ? {} : { windowId });
  if (!groups.length) return { closed: 0, undo: [] };
  const tabs = (await allTabs(windowId === undefined ? {} : { windowId })).filter((t) => t.groupId !== NO_GROUP);
  const undo = await recordClosedGroups(tabs, groups);
  await closeTabsDiscardingGroups(tabs);
  return { closed: groups.length, undo };
}

export async function saveAndCloseGroup(groupId: number, name?: string): Promise<void> {
  await saveGroupSession(groupId, name);
  // Already saved as a named session, so no extra auto-saved copy.
  await closeGroup(groupId, false);
}

export async function ungroup(groupId: number): Promise<void> {
  const tabs = await allTabs({ groupId });
  const ids = tabs.map((t) => t.id);
  if (!ids.length) return;
  await markPendingMoves(ids);
  await quietly(chrome.tabs.ungroup(tuple(ids)));
}

export async function ungroupAll(windowId: number): Promise<void> {
  const tabs = await allTabs({ windowId });
  const ids = tabs.filter((t) => t.groupId !== NO_GROUP).map((t) => t.id);
  if (!ids.length) return;
  await markPendingMoves(ids);
  await quietly(chrome.tabs.ungroup(tuple(ids)));
}

export async function setCollapsedAll(windowId: number, collapsed: boolean): Promise<void> {
  const groups = await chrome.tabGroups.query({ windowId });
  for (const g of groups) await quietly(chrome.tabGroups.update(g.id, { collapsed }));
}

export async function setCollapsed(groupId: number, collapsed: boolean): Promise<void> {
  await chrome.tabGroups.update(groupId, { collapsed });
}

export async function renameGroup(groupId: number, title: string): Promise<void> {
  await chrome.tabGroups.update(groupId, { title });
}

export async function recolorGroup(groupId: number, color: GroupColor): Promise<void> {
  await chrome.tabGroups.update(groupId, { color });
}

/** Moves the whole group into a fresh window (chrome.tabGroups.move keeps title and colour). */
export async function moveGroupToNewWindow(groupId: number): Promise<void> {
  const tabs = await allTabs({ groupId });
  if (!tabs.length) return;
  const win = await chrome.windows.create({ focused: true });
  if (!win?.id) throw new Error('Could not create window');
  const placeholder = win.tabs?.[0]?.id;
  await markPendingMoves(tabs.map((t) => t.id));
  await chrome.tabGroups.move(groupId, { windowId: win.id, index: -1 });
  if (placeholder !== undefined) await quietly(chrome.tabs.remove(placeholder));
}

/** Group of the active tab in the focused window, or null when it is ungrouped. */
export async function currentGroupId(): Promise<number | null> {
  const t = await activeTab();
  if (!t || t.groupId === NO_GROUP) return null;
  return t.groupId;
}
