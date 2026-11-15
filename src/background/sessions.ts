import { CLOSED_SESSIONS_MAX, newId } from '@/shared/defaults';
import { getLocal, patchLocal } from '@/shared/storage';
import type { GroupSnapshot, SavedGroup, SavedTab, Session, TabSnapshot, WindowSnapshot } from '@/shared/types';
import { addClosedSessions, buildClosedSessions, isSavable as savable, toSavedTab as toSaved } from '@/core/sessions';
import { buildWindowSnapshot } from '@/core/autosave';
import { allGroups, allTabs, quietly, tuple } from './tabs';
import { markPendingMoves } from './overrides';

export async function snapshotWindow(windowId: number): Promise<WindowSnapshot> {
  const [tabs, groups] = await Promise.all([allTabs({ windowId }), allGroups({ windowId })]);
  return buildWindowSnapshot(tabs, groups);
}

export async function snapshotGroup(groupId: number): Promise<SavedGroup> {
  const [g, tabs] = await Promise.all([chrome.tabGroups.get(groupId), allTabs({ groupId })]);
  return {
    title: g.title ?? '',
    color: g.color as SavedGroup['color'],
    collapsed: g.collapsed,
    tabs: tabs
      .sort((a, b) => a.index - b.index)
      .filter(savable)
      .map(toSaved),
  };
}

export async function saveWindowSession(windowId: number, name: string): Promise<Session> {
  const snap = await snapshotWindow(windowId);
  return storeSession({
    id: newId(),
    name: name.trim() || defaultName(),
    createdAt: Date.now(),
    kind: 'window',
    ...snap,
  });
}

export async function saveGroupSession(groupId: number, name?: string): Promise<Session> {
  const group = await snapshotGroup(groupId);
  const session: Session = {
    id: newId(),
    name: (name ?? '').trim() || group.title || defaultName(),
    createdAt: Date.now(),
    kind: 'group',
    groups: [group],
    ungrouped: [],
  };
  return storeSession(session);
}

async function storeSession(session: Session): Promise<Session> {
  if (session.groups.every((g) => g.tabs.length === 0) && session.ungrouped.length === 0) {
    throw new Error('Nothing to save: no http(s) tabs');
  }
  await patchLocal((l) => {
    l.sessions = [session, ...l.sessions];
  });
  return session;
}

function defaultName(): string {
  return `Session ${new Date().toLocaleString()}`;
}

/** Opens the session in a new window and recreates its groups with their names and colours. */
export async function restoreSession(id: string): Promise<void> {
  const local = await getLocal();
  const session = local.sessions.find((s) => s.id === id);
  if (!session) throw new Error('Session not found');
  await openSession(session);
  // Auto-saved "closed groups" entries are one-shot: once reopened they are no longer needed.
  if (session.autoSaved) await deleteSession(id);
}

/**
 * Opens the session and recreates its groups. With `intoWindowId` (and that window still open)
 * the tabs are appended there; otherwise a new window is created.
 */
export async function openSession(session: Session, intoWindowId?: number): Promise<void> {
  const ordered: Array<{ tab: SavedTab; group: SavedGroup | null }> = [];
  for (const g of session.groups) for (const t of g.tabs) ordered.push({ tab: t, group: g });
  for (const t of session.ungrouped) ordered.push({ tab: t, group: null });
  if (!ordered.length) throw new Error('Session is empty');

  const target = intoWindowId === undefined ? undefined : await quietly(chrome.windows.get(intoWindowId));
  let windowId: number;
  let ids: Array<number | undefined>;
  if (target?.id !== undefined) {
    windowId = target.id;
    ids = [];
    for (const [i, o] of ordered.entries()) {
      const t = await quietly(chrome.tabs.create({ windowId, url: o.tab.url, active: i === 0 }));
      ids.push(t?.id);
    }
  } else {
    const win = await chrome.windows.create({ url: ordered.map((o) => o.tab.url), focused: true });
    if (!win?.id) throw new Error('Could not create window');
    windowId = win.id;
    const created = (await chrome.tabs.query({ windowId })).sort((a, b) => a.index - b.index);
    ids = created.map((t) => t.id);
  }
  // Tabs are created in order, so index i corresponds to ordered[i].
  const tabIdFor = (i: number) => ids[i];

  // Pinned first: pinning moves tabs to the front, which is what the user expects.
  for (let i = 0; i < ordered.length; i++) {
    const tid = tabIdFor(i);
    if (tid !== undefined && ordered[i]!.tab.pinned) await quietly(chrome.tabs.update(tid, { pinned: true }));
  }

  let i = 0;
  for (const g of session.groups) {
    const tabIds: number[] = [];
    for (let k = 0; k < g.tabs.length; k++, i++) {
      const tid = tabIdFor(i);
      if (tid !== undefined && !ordered[i]!.tab.pinned) tabIds.push(tid);
    }
    if (!tabIds.length) continue;
    await markPendingMoves(tabIds);
    const gid = await quietly(chrome.tabs.group({ tabIds: tuple(tabIds), createProperties: { windowId } }));
    if (gid !== undefined) {
      await quietly(chrome.tabGroups.update(gid, { title: g.title, color: g.color }));
      if (g.collapsed) await quietly(chrome.tabGroups.update(gid, { collapsed: true }));
    }
  }
}

export async function deleteSession(id: string): Promise<void> {
  await patchLocal((l) => {
    l.sessions = l.sessions.filter((s) => s.id !== id);
  });
}

export async function renameSession(id: string, name: string): Promise<void> {
  await patchLocal((l) => {
    const s = l.sessions.find((x) => x.id === id);
    if (s) s.name = name.trim() || s.name;
  });
}

/** Auto-saves groups that are about to be closed (one session per window). Returns the new session ids. */
export async function recordClosedGroups(tabs: TabSnapshot[], groups: GroupSnapshot[]): Promise<string[]> {
  const added = buildClosedSessions(tabs, groups, { now: Date.now(), newId });
  if (!added.length) return [];
  await patchLocal((l) => {
    l.sessions = addClosedSessions(l.sessions, added, CLOSED_SESSIONS_MAX);
  });
  return added.map((s) => s.id);
}

/** Undo for a close action: reopens the auto-saved groups in their original window and forgets them. */
export async function undoClose(ids: string[]): Promise<number> {
  const local = await getLocal();
  const sessions = local.sessions.filter((s) => ids.includes(s.id));
  if (!sessions.length) throw new Error('Nothing to undo');
  for (const s of sessions) await openSession(s, s.windowId);
  await patchLocal((l) => {
    l.sessions = l.sessions.filter((s) => !ids.includes(s.id));
  });
  return sessions.reduce((n, s) => n + s.groups.length, 0);
}
