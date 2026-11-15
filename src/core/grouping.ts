import {
  NO_GROUP,
  type GroupAction,
  type GroupColor,
  type GroupSnapshot,
  type Settings,
  type TabSnapshot,
} from '@/shared/types';
import { assignGroup, type RuleInput } from './rules';

export interface GroupingState {
  /** Groups created by Tab Herder (ids). Groups not in this set belong to the user and are left alone. */
  managedGroupIds: Set<number>;
  /** Tabs the user has moved manually; never regrouped automatically. */
  overriddenTabIds: Set<number>;
  /** Optional meta descriptions by tab id (content grouping). */
  descriptions?: Map<number, string>;
}

const keyOf = (title: string) => title.trim().toLowerCase();

/**
 * Computes the grouping actions for ONE window. Pure: no chrome.* calls.
 * - Pinned tabs, incognito tabs (unless enabled), overridden tabs and tabs in user-made groups are untouched.
 * - Tabs join an existing group with the same title (managed groups preferred, otherwise the user's own group).
 * - New groups are only created when at least `minGroupSize` tabs share an assignment.
 * - Tabs sitting in a managed group whose assignment no longer matches are moved (or ungrouped).
 */
export function planGrouping(
  tabs: TabSnapshot[],
  groups: GroupSnapshot[],
  settings: Settings,
  state: GroupingState,
): GroupAction[] {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const groupsByKey = new Map<string, GroupSnapshot>();
  for (const g of groups) {
    const key = keyOf(g.title);
    if (!key) continue;
    const existing = groupsByKey.get(key);
    const managed = state.managedGroupIds.has(g.id);
    if (!existing || (managed && !state.managedGroupIds.has(existing.id))) groupsByKey.set(key, g);
  }

  const buckets = new Map<string, { title: string; color: GroupColor; tabs: TabSnapshot[] }>();
  const toUngroup: number[] = [];

  for (const tab of tabs) {
    if (tab.pinned) continue;
    if (tab.incognito && !settings.includeIncognito) continue;
    if (state.overriddenTabIds.has(tab.id)) continue;
    const inManaged = tab.groupId !== NO_GROUP && state.managedGroupIds.has(tab.groupId);
    if (tab.groupId !== NO_GROUP && !inManaged) continue; // user's own group

    const input: RuleInput = { url: tab.url, title: tab.title, description: state.descriptions?.get(tab.id) };
    const assignment = assignGroup(input, settings);
    if (!assignment) continue; // e.g. chrome:// page inside a managed group: leave it where it is

    const key = keyOf(assignment.name);
    if (inManaged) {
      const current = groupsById.get(tab.groupId);
      if (current && keyOf(current.title) === key) continue; // already in the right group
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.tabs.push(tab);
    else buckets.set(key, { title: assignment.name, color: assignment.color, tabs: [tab] });
  }

  const actions: GroupAction[] = [];
  for (const [key, bucket] of buckets) {
    const existing = groupsByKey.get(key);
    const tabIds = bucket.tabs.map((t) => t.id);
    if (existing) {
      actions.push({ type: 'join', groupId: existing.id, tabIds });
      continue;
    }
    if (tabIds.length >= Math.max(1, settings.minGroupSize)) {
      const windowId = bucket.tabs[0]!.windowId;
      actions.push({ type: 'create', windowId, title: bucket.title, color: bucket.color, tabIds });
    } else {
      // Too few tabs for a new group; tabs that are stuck in a wrong managed group get released.
      for (const t of bucket.tabs) if (t.groupId !== NO_GROUP) toUngroup.push(t.id);
    }
  }
  if (toUngroup.length) actions.push({ type: 'ungroup', tabIds: toUngroup });
  return actions;
}
