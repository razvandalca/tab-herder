import type { GroupColor, GroupSnapshot, TabSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';

/** Converts a chrome tab into the pure snapshot used by the core modules. */
export function snapshotTab(t: chrome.tabs.Tab): TabSnapshot | null {
  if (t.id === undefined || t.windowId === undefined) return null;
  return {
    id: t.id,
    windowId: t.windowId,
    index: t.index,
    url: t.url ?? t.pendingUrl ?? '',
    title: t.title ?? '',
    pinned: !!t.pinned,
    active: !!t.active,
    audible: !!t.audible,
    discarded: !!t.discarded,
    incognito: !!t.incognito,
    groupId: t.groupId ?? NO_GROUP,
    lastAccessed: t.lastAccessed,
    favIconUrl: t.favIconUrl,
  };
}

export function snapshotGroup(g: chrome.tabGroups.TabGroup): GroupSnapshot {
  return { id: g.id, windowId: g.windowId, title: g.title ?? '', color: g.color as GroupColor, collapsed: g.collapsed };
}

export async function allTabs(query: chrome.tabs.QueryInfo = {}): Promise<TabSnapshot[]> {
  const tabs = await chrome.tabs.query(query);
  return tabs.map(snapshotTab).filter((t): t is TabSnapshot => t !== null);
}

export async function allGroups(query: chrome.tabGroups.QueryInfo = {}): Promise<GroupSnapshot[]> {
  const groups = await chrome.tabGroups.query(query);
  return groups.map(snapshotGroup);
}

export async function currentWindowId(): Promise<number> {
  const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  return w.id!;
}

export async function activeTab(windowId?: number): Promise<TabSnapshot | null> {
  const [t] = await chrome.tabs.query(
    windowId === undefined ? { active: true, lastFocusedWindow: true } : { active: true, windowId },
  );
  return t ? snapshotTab(t) : null;
}

/** Chrome's typings want a non-empty tuple for tab id lists. */
export function tuple(ids: number[]): [number, ...number[]] {
  if (!ids.length) throw new Error('Expected at least one tab id');
  return ids as [number, ...number[]];
}

/** Runs chrome calls that may legitimately fail (tab closed meanwhile, etc.) without throwing. */
export async function quietly<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}
