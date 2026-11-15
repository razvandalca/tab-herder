import type { TabSnapshot } from '@/shared/types';
import { isGroupableUrl, normalizeUrl } from './url';

export interface DuplicateSet {
  key: string;
  keep: number;
  close: number[];
}

/**
 * Finds tabs with the same normalised URL. In each set the kept tab is the active one,
 * else a pinned one, else the oldest (lowest id). Pinned and audible tabs are never closed.
 */
export function findDuplicates(tabs: TabSnapshot[]): DuplicateSet[] {
  const byKey = new Map<string, TabSnapshot[]>();
  for (const t of tabs) {
    if (!isGroupableUrl(t.url)) continue;
    const key = normalizeUrl(t.url);
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }
  const sets: DuplicateSet[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const keeper = pickKeeper(list);
    const close = list.filter((t) => t.id !== keeper.id && !t.pinned && !t.audible).map((t) => t.id);
    if (close.length) sets.push({ key, keep: keeper.id, close });
  }
  return sets;
}

function pickKeeper(list: TabSnapshot[]): TabSnapshot {
  const sorted = [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.id - b.id;
  });
  return sorted[0]!;
}

/** Flat list of tab ids to close. */
export function duplicateTabIds(tabs: TabSnapshot[]): number[] {
  return findDuplicates(tabs).flatMap((s) => s.close);
}
