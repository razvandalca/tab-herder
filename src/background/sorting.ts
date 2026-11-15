import type { GroupSortKey, TabSortKey } from '@/core/sorting';
import { commonPrefix, sameItem, sortGroupTabs, sortWindowGroups, stripItems } from '@/core/sorting';
import { allGroups, allTabs, quietly, tuple } from './tabs';
import { clearPendingMoves, markPendingMoves } from './overrides';

/** Lets any groupId events caused by our moves reach handleGroupChange before marks are cleared. */
const SETTLE_MS = 200;

async function withPendingMoves(tabIds: number[], moves: () => Promise<void>): Promise<void> {
  await markPendingMoves(tabIds);
  try {
    await moves();
  } finally {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    await clearPendingMoves(tabIds);
  }
}

/** Reorders the tabs of one group. Returns how many tabs were moved. */
export async function sortTabsInGroup(groupId: number, key: TabSortKey): Promise<number> {
  const tabs = (await allTabs({ groupId })).sort((a, b) => a.index - b.index);
  const target = sortGroupTabs(tabs, groupId, key);
  const skip = commonPrefix(
    tabs.map((t) => t.id),
    target,
  );
  const moving = target.slice(skip);
  if (!moving.length) return 0;
  const start = tabs[0]!.index + skip;
  // Moving inside a group can briefly drop a tab out of it; don't record that as a user override.
  await withPendingMoves(moving, async () => {
    await chrome.tabs.move(moving, { index: start });
    // Safety net: put any tab Chrome pushed out of the group back in.
    await quietly(chrome.tabs.group({ groupId, tabIds: tuple(moving) }));
  });
  return moving.length;
}

/**
 * Reorders the groups of one window. Ungrouped tabs keep their slots between groups. Every
 * strip item after the first difference is moved to the end of the window in target order.
 */
export async function sortGroupsInWindow(windowId: number, key: GroupSortKey): Promise<number> {
  const [tabs, groups] = await Promise.all([allTabs({ windowId }), allGroups({ windowId })]);
  const current = stripItems(tabs, windowId);
  const target = sortWindowGroups(tabs, groups, windowId, key);
  const skip = commonPrefix(current, target, sameItem);
  const moving = target.slice(skip);
  if (!moving.some((i) => i.kind === 'group')) return 0;
  const movedTabIds = tabs
    .filter((t) => moving.some((i) => (i.kind === 'tab' ? i.id === t.id : i.id === t.groupId)))
    .map((t) => t.id);
  await withPendingMoves(movedTabIds, async () => {
    for (const item of moving) {
      if (item.kind === 'group') await chrome.tabGroups.move(item.id, { windowId, index: -1 });
      else await chrome.tabs.move(item.id, { windowId, index: -1 });
    }
  });
  return moving.filter((i) => i.kind === 'group').length;
}
