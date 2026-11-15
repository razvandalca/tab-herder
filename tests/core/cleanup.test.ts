import { beforeEach, describe, expect, it } from 'vitest';
import { isAllowlisted, planCleanup } from '@/core/cleanup';
import { group, resetIds, rule, settings, tab } from './helpers';

beforeEach(resetIds);

const NOW = 1_800_000_000_000;
const hoursAgo = (h: number) => NOW - h * 3_600_000;

describe('isAllowlisted', () => {
  it('matches domains and subdomains from the allowlist', () => {
    expect(isAllowlisted('https://mail.google.com/x', ['google.com'])).toBe(true);
    expect(isAllowlisted('https://google.com.evil.com', ['google.com'])).toBe(false);
    expect(isAllowlisted('chrome://x', ['x'])).toBe(false);
  });
});

describe('planCleanup', () => {
  it('discards inactive tabs by default and skips recent ones', () => {
    const tabs = [
      tab({ id: 1, url: 'https://a.com', lastAccessed: hoursAgo(13) }),
      tab({ id: 2, url: 'https://b.com', lastAccessed: hoursAgo(1) }),
    ];
    const plan = planCleanup({ tabs, groups: [], settings: settings(), now: NOW });
    expect(plan).toEqual({ discard: [1], close: [] });
  });
  it('closes inactive tabs when configured, and respects the hours setting', () => {
    const tabs = [tab({ id: 1, url: 'https://a.com', lastAccessed: hoursAgo(3) })];
    const s = settings({}, { inactiveAction: 'close', inactiveHours: 2 });
    expect(planCleanup({ tabs, groups: [], settings: s, now: NOW }).close).toEqual([{ tabId: 1, reason: 'inactive' }]);
    const off = settings({}, { inactiveHours: 0 });
    expect(planCleanup({ tabs, groups: [], settings: off, now: NOW })).toEqual({ discard: [], close: [] });
  });
  it('never touches pinned, audible, active, allowlisted, internal, dirty or already-discarded tabs', () => {
    const old = hoursAgo(100);
    const tabs = [
      tab({ id: 1, url: 'https://a.com', lastAccessed: old, pinned: true }),
      tab({ id: 2, url: 'https://a.com/2', lastAccessed: old, audible: true }),
      tab({ id: 3, url: 'https://a.com/3', lastAccessed: old, active: true }),
      tab({ id: 4, url: 'https://keep.me/x', lastAccessed: old }),
      tab({ id: 5, url: 'chrome://extensions', lastAccessed: old }),
      tab({ id: 6, url: 'https://a.com/6', lastAccessed: old }),
      tab({ id: 7, url: 'https://a.com/7', lastAccessed: old, discarded: true }),
      tab({ id: 8, url: 'https://a.com/8', lastAccessed: old }),
    ];
    const s = settings({}, { allowlist: ['keep.me'] });
    const plan = planCleanup({ tabs, groups: [], settings: s, now: NOW, dirtyTabIds: new Set([6]) });
    expect(plan).toEqual({ discard: [8], close: [] });
  });
  it('uses the fallback activity map when lastAccessed is missing, else treats the tab as fresh', () => {
    const tabs = [tab({ id: 1, url: 'https://a.com' }), tab({ id: 2, url: 'https://b.com' })];
    const plan = planCleanup({ tabs, groups: [], settings: settings(), now: NOW, lastActive: { 1: hoursAgo(20) } });
    expect(plan.discard).toEqual([1]);
  });
  it('closes duplicates before considering inactivity, respecting protection', () => {
    const tabs = [
      tab({ id: 1, url: 'https://a.com/x', lastAccessed: hoursAgo(1), active: true }),
      tab({ id: 2, url: 'https://a.com/x?utm_source=1', lastAccessed: hoursAgo(1) }),
      tab({ id: 3, url: 'https://a.com/x', lastAccessed: hoursAgo(1), pinned: true }),
    ];
    expect(planCleanup({ tabs, groups: [], settings: settings(), now: NOW }).close).toEqual([
      { tabId: 2, reason: 'duplicate' },
    ]);
    const noDupes = settings({}, { closeDuplicates: false });
    expect(planCleanup({ tabs, groups: [], settings: noDupes, now: NOW }).close).toEqual([]);
  });
  it('auto-closes a whole group after the rule timeout when every member is idle', () => {
    const s = settings({ rules: [rule({ name: 'Video', pattern: 'youtube.com', autoCloseMinutes: 30 })] });
    const groups = [group({ id: 9, title: 'Video' })];
    const idle = [
      tab({ id: 1, url: 'https://youtube.com/1', groupId: 9, lastAccessed: NOW - 31 * 60_000 }),
      tab({ id: 2, url: 'https://youtube.com/2', groupId: 9, lastAccessed: NOW - 45 * 60_000 }),
    ];
    expect(planCleanup({ tabs: idle, groups, settings: s, now: NOW }).close).toEqual([
      { tabId: 1, reason: 'groupAutoClose' },
      { tabId: 2, reason: 'groupAutoClose' },
    ]);
    // One member recently used -> whole group stays
    const mixed = [idle[0]!, tab({ id: 3, url: 'https://youtube.com/3', groupId: 9, lastAccessed: NOW - 60_000 })];
    expect(planCleanup({ tabs: mixed, groups, settings: s, now: NOW }).close).toEqual([]);
    // Group interaction counts as activity
    expect(
      planCleanup({ tabs: idle, groups, settings: s, now: NOW, groupLastActive: { 9: NOW - 60_000 } }).close,
    ).toEqual([]);
    // A protected member (active) blocks the group close
    const withActive = [idle[0]!, { ...idle[1]!, active: true }];
    expect(planCleanup({ tabs: withActive, groups, settings: s, now: NOW }).close).toEqual([]);
  });
  it('does not both close and discard the same tab', () => {
    const s = settings({ rules: [rule({ name: 'Video', pattern: 'youtube.com', autoCloseMinutes: 1 })] });
    const tabs = [tab({ id: 1, url: 'https://youtube.com/1', groupId: 9, lastAccessed: hoursAgo(50) })];
    const plan = planCleanup({ tabs, groups: [group({ id: 9, title: 'Video' })], settings: s, now: NOW });
    expect(plan.close.map((c) => c.tabId)).toEqual([1]);
    expect(plan.discard).toEqual([]);
  });
});
