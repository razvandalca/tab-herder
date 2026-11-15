import { patchSessionState } from '@/shared/storage';

/** How long one of our own moves is remembered so the resulting event is not seen as a manual move. */
const PENDING_TTL_MS = 10_000;

/** Call before the extension moves tabs between groups. */
export async function markPendingMoves(tabIds: number[]): Promise<void> {
  if (!tabIds.length) return;
  const now = Date.now();
  await patchSessionState((s) => {
    for (const id of tabIds) s.pendingMoves[id] = now;
  });
}

/**
 * Drops pending-move marks that no group-change event consumed (e.g. reordering within a group),
 * so a real manual move of those tabs right afterwards is still recorded as an override.
 */
export async function clearPendingMoves(tabIds: number[]): Promise<void> {
  if (!tabIds.length) return;
  await patchSessionState((s) => {
    for (const id of tabIds) delete s.pendingMoves[id];
  });
}

export async function markManagedGroup(groupId: number, key: string): Promise<void> {
  await patchSessionState((s) => {
    s.managedGroups[groupId] = { key, createdAt: Date.now() };
  });
}

/** tabs.onUpdated with a groupId change: decide whether it was us or the user. */
export async function handleGroupChange(tabId: number): Promise<void> {
  await patchSessionState((s) => {
    const at = s.pendingMoves[tabId];
    if (at !== undefined && Date.now() - at < PENDING_TTL_MS) {
      delete s.pendingMoves[tabId];
      return;
    }
    delete s.pendingMoves[tabId];
    s.overrides[tabId] = Date.now();
  });
}

export async function forgetTab(tabId: number): Promise<void> {
  await patchSessionState((s) => {
    delete s.overrides[tabId];
    delete s.pendingMoves[tabId];
    delete s.lastActive[tabId];
  });
}

export async function forgetGroup(groupId: number): Promise<void> {
  await patchSessionState((s) => {
    delete s.managedGroups[groupId];
    delete s.groupLastActive[groupId];
  });
}

export async function touchTab(tabId: number, groupId: number): Promise<void> {
  await patchSessionState((s) => {
    const now = Date.now();
    s.lastActive[tabId] = now;
    if (groupId >= 0) s.groupLastActive[groupId] = now;
  });
}

export async function touchGroup(groupId: number): Promise<void> {
  await patchSessionState((s) => {
    s.groupLastActive[groupId] = Date.now();
  });
}
