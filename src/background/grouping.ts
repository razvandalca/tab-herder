import { planGrouping } from '@/core/grouping';
import { GROUPING_DEBOUNCE_MS } from '@/shared/defaults';
import { getSessionState, getSettings } from '@/shared/storage';
import type { GroupAction, Settings } from '@/shared/types';
import { allGroups, allTabs, quietly, tuple } from './tabs';
import { markManagedGroup, markPendingMoves } from './overrides';
import { hasContentPermission, probeTabs } from './contentScripts';

/** Groups tabs in one window according to settings. Returns the number of tabs moved. */
export async function regroupWindow(windowId: number, settings?: Settings): Promise<number> {
  const s = settings ?? (await getSettings());
  if (s.mode === 'off') return 0;
  const [tabs, groups, state] = await Promise.all([allTabs({ windowId }), allGroups({ windowId }), getSessionState()]);
  const managedGroupIds = new Set(Object.keys(state.managedGroups).map(Number));
  const overriddenTabIds = new Set(Object.keys(state.overrides).map(Number));

  let descriptions: Map<number, string> | undefined;
  if (s.contentGrouping && (await hasContentPermission())) {
    const probes = await probeTabs(tabs.filter((t) => !t.pinned && !t.discarded).map((t) => t.id));
    descriptions = new Map([...probes].map(([id, r]) => [id, r.description]));
  }

  const actions = planGrouping(tabs, groups, s, { managedGroupIds, overriddenTabIds, descriptions });
  return applyActions(actions);
}

export async function regroupAll(): Promise<number> {
  const settings = await getSettings();
  if (settings.mode === 'off') return 0;
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  let moved = 0;
  for (const w of windows) {
    if (w.id === undefined) continue;
    if (w.incognito && !settings.includeIncognito) continue;
    moved += await regroupWindow(w.id, settings);
  }
  return moved;
}

export async function applyActions(actions: GroupAction[]): Promise<number> {
  let moved = 0;
  for (const a of actions) {
    if (!a.tabIds.length) continue;
    switch (a.type) {
      case 'create': {
        await markPendingMoves(a.tabIds);
        const groupId = await quietly(
          chrome.tabs.group({ tabIds: tuple(a.tabIds), createProperties: { windowId: a.windowId } }),
        );
        if (groupId === undefined) break;
        await markManagedGroup(groupId, a.title.toLowerCase());
        await quietly(chrome.tabGroups.update(groupId, { title: a.title, color: a.color }));
        moved += a.tabIds.length;
        break;
      }
      case 'join': {
        await markPendingMoves(a.tabIds);
        const r = await quietly(chrome.tabs.group({ tabIds: tuple(a.tabIds), groupId: a.groupId }));
        if (r !== undefined) moved += a.tabIds.length;
        break;
      }
      case 'ungroup': {
        await markPendingMoves(a.tabIds);
        await quietly(chrome.tabs.ungroup(tuple(a.tabIds)));
        moved += a.tabIds.length;
        break;
      }
    }
  }
  return moved;
}

// ---- debounce for auto mode -------------------------------------------------
// setTimeout is fine here: the worker stays alive for a while after each event, and if it is
// killed before the timer fires the next tab event simply schedules a new pass.
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function scheduleRegroup(windowId: number): void {
  const existing = timers.get(windowId);
  if (existing) clearTimeout(existing);
  timers.set(
    windowId,
    setTimeout(() => {
      timers.delete(windowId);
      void regroupWindow(windowId).catch((e) => console.warn('[tab-herder] regroup failed', e));
    }, GROUPING_DEBOUNCE_MS),
  );
}
