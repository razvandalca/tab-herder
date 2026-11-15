import type { GroupSnapshot, TabSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';
import { hostname, isGroupableUrl } from './url';

export type TabSortKey = 'title' | 'domain' | 'lastUsed';
export type GroupSortKey = 'name' | 'size';

export const TAB_SORT_LABELS: Record<TabSortKey, string> = {
  title: 'By title',
  domain: 'By domain',
  lastUsed: 'By last used',
};

export const GROUP_SORT_LABELS: Record<GroupSortKey, string> = {
  name: 'By name',
  size: 'By size',
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Empty strings sort after non-empty ones; otherwise locale order. */
function compareText(a: string, b: string): number {
  if (!a !== !b) return a ? -1 : 1;
  return collator.compare(a, b);
}

/** Sorts a copy; Array.prototype.sort is stable, so ties keep their input order. */
function stableSort<T>(items: T[], cmp: (a: T, b: T) => number): T[] {
  return [...items].sort(cmp);
}

/** Host of a web page, or '' for chrome://, file:// and the like. */
function webHost(url: string): string {
  return isGroupableUrl(url) ? (hostname(url) ?? '') : '';
}

function tabComparator(key: TabSortKey): (a: TabSnapshot, b: TabSnapshot) => number {
  switch (key) {
    case 'title':
      return (a, b) => compareText(a.title.trim(), b.title.trim());
    case 'domain':
      return (a, b) => compareText(webHost(a.url), webHost(b.url));
    case 'lastUsed':
      // Most recently used first; tabs Chrome has no timestamp for go last.
      return (a, b) => (b.lastAccessed ?? -Infinity) - (a.lastAccessed ?? -Infinity) || 0;
  }
}

/**
 * Target order (tab ids) for the tabs of one group. Pinned tabs and tabs of other groups are
 * ignored; ties keep their current strip order.
 */
export function sortGroupTabs(tabs: TabSnapshot[], groupId: number, key: TabSortKey): number[] {
  const members = tabs
    .filter((t) => t.groupId === groupId && groupId !== NO_GROUP && !t.pinned)
    .sort((a, b) => a.index - b.index);
  return stableSort(members, tabComparator(key)).map((t) => t.id);
}

/** One position in the tab strip: an ungrouped tab or a whole group. */
export type StripItem = { kind: 'tab'; id: number } | { kind: 'group'; id: number };

/** Current strip of one window, pinned tabs excluded, as ungrouped tabs and groups in order. */
export function stripItems(tabs: TabSnapshot[], windowId: number): StripItem[] {
  const items: StripItem[] = [];
  const seen = new Set<number>();
  const ordered = tabs.filter((t) => t.windowId === windowId && !t.pinned).sort((a, b) => a.index - b.index);
  for (const t of ordered) {
    if (t.groupId === NO_GROUP) items.push({ kind: 'tab', id: t.id });
    else if (!seen.has(t.groupId)) {
      seen.add(t.groupId);
      items.push({ kind: 'group', id: t.groupId });
    }
  }
  return items;
}

/**
 * Target strip for a window with its groups sorted. Ungrouped tabs keep their slots: only the
 * slots holding groups are refilled, in sorted order. Ties keep their current order.
 */
export function sortWindowGroups(
  tabs: TabSnapshot[],
  groups: GroupSnapshot[],
  windowId: number,
  key: GroupSortKey,
): StripItem[] {
  const items = stripItems(tabs, windowId);
  const titles = new Map(groups.map((g) => [g.id, g.title.trim()]));
  const sizes = new Map<number, number>();
  for (const t of tabs)
    if (t.windowId === windowId && t.groupId !== NO_GROUP) sizes.set(t.groupId, (sizes.get(t.groupId) ?? 0) + 1);
  const groupIds = items.filter((i) => i.kind === 'group').map((i) => i.id);
  const cmp =
    key === 'name'
      ? (a: number, b: number) => compareText(titles.get(a) ?? '', titles.get(b) ?? '')
      : (a: number, b: number) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0);
  const sorted = stableSort(groupIds, cmp);
  let next = 0;
  return items.map((i) => (i.kind === 'group' ? { kind: 'group', id: sorted[next++]! } : i));
}

/** Number of leading entries already equal in both lists; only what follows needs moving. */
export function commonPrefix<T>(current: T[], target: T[], same: (a: T, b: T) => boolean = Object.is): number {
  let n = 0;
  while (n < current.length && n < target.length && same(current[n]!, target[n]!)) n++;
  return n;
}

export function sameItem(a: StripItem, b: StripItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}
