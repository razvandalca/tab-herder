import type { GroupSnapshot, SavedGroup, SavedTab, Session, TabSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';

/** chrome:// and similar pages cannot be reopened by extensions; skip empty new tabs too. */
export function isSavable(t: Pick<TabSnapshot, 'url'>): boolean {
  return /^(https?|ftp|file):/.test(t.url);
}

export const toSavedTab = (t: TabSnapshot): SavedTab => ({ url: t.url, title: t.title, pinned: t.pinned, favIconUrl: t.favIconUrl });

/** Short label for a set of groups, e.g. "Work, News +2". */
export function groupsLabel(groups: Array<Pick<SavedGroup, 'title'>>, shown = 2): string {
  const titles = groups.map((g) => g.title.trim() || 'Untitled');
  const head = titles.slice(0, shown).join(', ');
  return titles.length > shown ? `${head} +${titles.length - shown}` : head;
}

/**
 * Snapshots the given groups (title, colour, tabs in order) before they are closed, as one
 * auto-saved session per window so "Undo" can put them back where they were.
 * Groups with no reopenable tabs are skipped; windows with nothing left produce no session.
 */
export function buildClosedSessions(
  tabs: TabSnapshot[],
  groups: GroupSnapshot[],
  opts: { now: number; newId: () => string },
): Session[] {
  const tabsByGroup = new Map<number, SavedTab[]>();
  for (const t of [...tabs].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
    if (t.groupId === NO_GROUP || !isSavable(t)) continue;
    const list = tabsByGroup.get(t.groupId) ?? [];
    list.push(toSavedTab(t));
    tabsByGroup.set(t.groupId, list);
  }
  // Keep groups in tab-strip order: order by the index of their first tab.
  const firstIndex = new Map<number, number>();
  for (const t of tabs) {
    if (t.groupId === NO_GROUP) continue;
    firstIndex.set(t.groupId, Math.min(firstIndex.get(t.groupId) ?? Infinity, t.index));
  }
  const byWindow = new Map<number, SavedGroup[]>();
  const ordered = groups
    .filter((g) => tabsByGroup.has(g.id))
    .sort((a, b) => a.windowId - b.windowId || firstIndex.get(a.id)! - firstIndex.get(b.id)!);
  for (const g of ordered) {
    const list = byWindow.get(g.windowId) ?? [];
    list.push({ title: g.title, color: g.color, collapsed: g.collapsed, tabs: tabsByGroup.get(g.id)! });
    byWindow.set(g.windowId, list);
  }
  return [...byWindow].map(([windowId, saved]) => ({
    id: opts.newId(),
    name: `Closed: ${groupsLabel(saved)}`,
    createdAt: opts.now,
    kind: saved.length === 1 ? 'group' : 'window',
    groups: saved,
    ungrouped: [],
    autoSaved: true,
    windowId,
  }));
}

/** Prepends new auto-saved sessions and keeps only the newest `max` auto-saved ones; manual sessions are untouched. */
export function addClosedSessions(existing: Session[], added: Session[], max: number): Session[] {
  let kept = 0;
  return [...added, ...existing].filter((s) => !s.autoSaved || ++kept <= max);
}
