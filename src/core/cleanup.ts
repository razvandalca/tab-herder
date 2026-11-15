import type { CleanReason, GroupSnapshot, Rule, Settings, TabSnapshot } from '@/shared/types';
import { NO_GROUP } from '@/shared/types';
import { findDuplicates } from './duplicates';
import { hostname, isGroupableUrl, matchesDomain } from './url';

export interface CleanupInput {
  tabs: TabSnapshot[];
  groups: GroupSnapshot[];
  settings: Settings;
  now: number;
  /** Tabs whose content script reported unsaved form input. */
  dirtyTabIds?: Set<number>;
  /** Fallback last-active timestamps for tabs without `lastAccessed`. */
  lastActive?: Record<number, number>;
  /** Last time a group was interacted with (expanded, tab activated inside it). */
  groupLastActive?: Record<number, number>;
}

export interface CleanupPlan {
  discard: number[];
  close: Array<{ tabId: number; reason: CleanReason }>;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

export function isAllowlisted(url: string, allowlist: string[]): boolean {
  if (!isGroupableUrl(url)) return false;
  const host = hostname(url);
  if (!host) return false;
  return allowlist.some((d) => matchesDomain(host, d));
}

/** Tabs that must never be closed or discarded, regardless of age. */
export function isProtected(tab: TabSnapshot, settings: Settings, dirty?: Set<number>): boolean {
  if (tab.pinned || tab.audible || tab.active) return true;
  if (!isGroupableUrl(tab.url)) return true;
  if (isAllowlisted(tab.url, settings.cleanup.allowlist)) return true;
  if (dirty?.has(tab.id)) return true;
  return false;
}

export function lastAccessOf(tab: TabSnapshot, input: CleanupInput): number {
  const fallback = input.lastActive?.[tab.id];
  const v = tab.lastAccessed ?? fallback;
  return v ?? input.now; // unknown -> treat as just used
}

/** Finds the rule that configures auto-close for a group title, if any. */
export function autoCloseRuleFor(title: string, rules: Rule[]): Rule | undefined {
  const key = title.trim().toLowerCase();
  if (!key) return undefined;
  return rules.find((r) => r.enabled && (r.autoCloseMinutes ?? 0) > 0 && r.name.trim().toLowerCase() === key);
}

/** Pure cleanup decision. The service worker applies the plan and records what it closed. */
export function planCleanup(input: CleanupInput): CleanupPlan {
  const { tabs, groups, settings, now } = input;
  const c = settings.cleanup;
  const close = new Map<number, CleanReason>();
  const discard = new Set<number>();
  const dirty = input.dirtyTabIds;

  // 1. Duplicates
  if (c.closeDuplicates) {
    const byId = new Map(tabs.map((t) => [t.id, t]));
    for (const set of findDuplicates(tabs)) {
      for (const id of set.close) {
        const t = byId.get(id)!;
        if (isProtected(t, settings, dirty)) continue;
        close.set(id, 'duplicate');
      }
    }
  }

  // 2. Per-group auto-close
  const tabsByGroup = new Map<number, TabSnapshot[]>();
  for (const t of tabs) {
    if (t.groupId === NO_GROUP) continue;
    const list = tabsByGroup.get(t.groupId);
    if (list) list.push(t);
    else tabsByGroup.set(t.groupId, [t]);
  }
  for (const g of groups) {
    const rule = autoCloseRuleFor(g.title, settings.rules);
    if (!rule) continue;
    const members = tabsByGroup.get(g.id) ?? [];
    if (!members.length) continue;
    if (members.some((t) => isProtected(t, settings, dirty))) continue;
    const groupTouched = input.groupLastActive?.[g.id] ?? 0;
    const newest = Math.max(groupTouched, ...members.map((t) => lastAccessOf(t, input)));
    if (now - newest > (rule.autoCloseMinutes ?? 0) * MINUTE) {
      for (const t of members) if (!close.has(t.id)) close.set(t.id, 'groupAutoClose');
    }
  }

  // 3. Inactive tabs
  if (c.inactiveHours > 0) {
    const limit = c.inactiveHours * HOUR;
    for (const t of tabs) {
      if (close.has(t.id) || isProtected(t, settings, dirty)) continue;
      if (now - lastAccessOf(t, input) <= limit) continue;
      if (c.inactiveAction === 'close') close.set(t.id, 'inactive');
      else if (!t.discarded) discard.add(t.id);
    }
  }

  return {
    discard: [...discard],
    close: [...close].map(([tabId, reason]) => ({ tabId, reason })),
  };
}
