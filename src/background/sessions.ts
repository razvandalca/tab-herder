import { newId } from '@/shared/defaults';
import { getLocal, patchLocal } from '@/shared/storage';
import type { SavedGroup, SavedTab, Session, TabSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';
import { allGroups, allTabs, quietly, tuple } from './tabs';
import { markPendingMoves } from './overrides';

const toSaved = (t: TabSnapshot): SavedTab => ({ url: t.url, title: t.title, pinned: t.pinned, favIconUrl: t.favIconUrl });

function savable(t: TabSnapshot): boolean {
  // chrome:// and similar pages cannot be reopened by extensions; skip empty new tabs too.
  return /^(https?|ftp|file):/.test(t.url);
}

export async function snapshotWindow(windowId: number): Promise<Pick<Session, 'groups' | 'ungrouped'>> {
  const [tabs, groups] = await Promise.all([allTabs({ windowId }), allGroups({ windowId })]);
  const byGroup = new Map<number, SavedTab[]>();
  const ungrouped: SavedTab[] = [];
  for (const t of tabs.sort((a, b) => a.index - b.index)) {
    if (!savable(t)) continue;
    if (t.groupId === NO_GROUP) ungrouped.push(toSaved(t));
    else {
      const list = byGroup.get(t.groupId) ?? [];
      list.push(toSaved(t));
      byGroup.set(t.groupId, list);
    }
  }
  const savedGroups: SavedGroup[] = groups
    .filter((g) => byGroup.has(g.id))
    .map((g) => ({ title: g.title, color: g.color, collapsed: g.collapsed, tabs: byGroup.get(g.id)! }));
  return { groups: savedGroups, ungrouped };
}

export async function snapshotGroup(groupId: number): Promise<SavedGroup> {
  const [g, tabs] = await Promise.all([chrome.tabGroups.get(groupId), allTabs({ groupId })]);
  return {
    title: g.title ?? '',
    color: g.color as SavedGroup['color'],
    collapsed: g.collapsed,
    tabs: tabs.sort((a, b) => a.index - b.index).filter(savable).map(toSaved),
  };
}

export async function saveWindowSession(windowId: number, name: string): Promise<Session> {
  const snap = await snapshotWindow(windowId);
  return storeSession({ id: newId(), name: name.trim() || defaultName(), createdAt: Date.now(), kind: 'window', ...snap });
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
}

export async function openSession(session: Session): Promise<void> {
  const ordered: Array<{ tab: SavedTab; group: SavedGroup | null }> = [];
  for (const g of session.groups) for (const t of g.tabs) ordered.push({ tab: t, group: g });
  for (const t of session.ungrouped) ordered.push({ tab: t, group: null });
  if (!ordered.length) throw new Error('Session is empty');

  const win = await chrome.windows.create({ url: ordered.map((o) => o.tab.url), focused: true });
  if (!win?.id) throw new Error('Could not create window');
  const windowId = win.id;
  const created = (await chrome.tabs.query({ windowId })).sort((a, b) => a.index - b.index);
  const ids = created.map((t) => t.id!).filter((x) => x !== undefined);
  // windows.create opens the URLs in order, so index i corresponds to ordered[i].
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
