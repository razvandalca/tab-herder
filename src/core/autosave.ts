// Pure helpers for scheduled window snapshots (autosaves). No chrome.* here.
import type { Autosave, GroupSnapshot, SavedGroup, SavedTab, TabSnapshot, WindowSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';
import { isSavable, toSavedTab } from './sessions';

export const AUTOSAVE_KEEP_MAX = 20;

function toSaved(t: TabSnapshot, opts: { favicons?: boolean }): SavedTab {
  const { favIconUrl, ...saved } = toSavedTab(t);
  return opts.favicons !== false && favIconUrl ? { ...saved, favIconUrl } : saved;
}

/** Turns one window's tabs and groups into the stored session shape (tab order preserved). */
export function buildWindowSnapshot(
  tabs: TabSnapshot[],
  groups: GroupSnapshot[],
  opts: { favicons?: boolean } = {},
): WindowSnapshot {
  const byGroup = new Map<number, SavedTab[]>();
  const ungrouped: SavedTab[] = [];
  for (const t of [...tabs].sort((a, b) => a.index - b.index)) {
    if (!isSavable(t)) continue;
    if (t.groupId === NO_GROUP) ungrouped.push(toSaved(t, opts));
    else {
      const list = byGroup.get(t.groupId) ?? [];
      list.push(toSaved(t, opts));
      byGroup.set(t.groupId, list);
    }
  }
  const savedGroups: SavedGroup[] = groups
    .filter((g) => byGroup.has(g.id))
    .map((g) => ({ title: g.title, color: g.color, collapsed: g.collapsed, tabs: byGroup.get(g.id)! }));
  return { groups: savedGroups, ungrouped };
}

export function tabCount(w: WindowSnapshot): number {
  return w.groups.reduce((n, g) => n + g.tabs.length, 0) + w.ungrouped.length;
}

/**
 * Snapshots every (non-incognito) window. Favicons are dropped to keep chrome.storage.local
 * small (they are often data: URLs) and windows without any reopenable tab are skipped.
 */
export function buildAutosaveWindows(tabs: TabSnapshot[], groups: GroupSnapshot[]): WindowSnapshot[] {
  const windowIds: number[] = [];
  for (const t of [...tabs].sort((a, b) => a.windowId - b.windowId)) {
    if (!t.incognito && !windowIds.includes(t.windowId)) windowIds.push(t.windowId);
  }
  return windowIds
    .map((id) =>
      buildWindowSnapshot(
        tabs.filter((t) => t.windowId === id),
        groups.filter((g) => g.windowId === id),
        { favicons: false },
      ),
    )
    .filter((w) => tabCount(w) > 0);
}

/**
 * Stable fingerprint of what a restore would recreate: URLs, pinned state and group
 * title/colour/collapsed. Tab titles are ignored because pages change them constantly
 * (unread counters, timers) and that alone should not produce a new autosave.
 */
export function fingerprint(windows: WindowSnapshot[]): string {
  const shape = windows.map((w) => [
    w.groups.map((g) => [g.title, g.color, g.collapsed, g.tabs.map((t) => [t.url, t.pinned])]),
    w.ungrouped.map((t) => [t.url, t.pinned]),
  ]);
  return hash(JSON.stringify(shape));
}

/** 32-bit FNV-1a, hex. Only used for change detection, not security. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** True when the new snapshot has something to save and differs from the newest autosave. */
export function shouldAutosave(windows: WindowSnapshot[], existing: Autosave[]): boolean {
  if (!windows.length) return false;
  const latest = newest(existing);
  return !latest || latest.fingerprint !== fingerprint(windows);
}

function newest(list: Autosave[]): Autosave | undefined {
  return list.reduce<Autosave | undefined>((best, a) => (!best || a.createdAt > best.createdAt ? a : best), undefined);
}

export function clampKeep(keep: number): number {
  if (!Number.isFinite(keep)) return 1;
  return Math.min(AUTOSAVE_KEEP_MAX, Math.max(1, Math.floor(keep)));
}

/** Newest first, at most `keep` entries. */
export function pruneAutosaves(list: Autosave[], keep: number): Autosave[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, clampKeep(keep));
}

/** "Autosave – <time>" label shown in the Sessions panel. */
export function autosaveLabel(a: Pick<Autosave, 'createdAt'>, locale?: string): string {
  return `Autosave – ${new Date(a.createdAt).toLocaleString(locale)}`;
}
