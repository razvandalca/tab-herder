import { beforeEach, describe, expect, it } from 'vitest';
import { planGrouping, type GroupingState } from '@/core/grouping';
import { group, resetIds, rule, settings, tab } from './helpers';

beforeEach(resetIds);

const state = (p: Partial<GroupingState> = {}): GroupingState => ({
  managedGroupIds: new Set(),
  overriddenTabIds: new Set(),
  ...p,
});

describe('planGrouping', () => {
  it('creates a group per domain once minGroupSize is reached', () => {
    const tabs = [
      tab({ id: 1, url: 'https://github.com/a' }),
      tab({ id: 2, url: 'https://docs.github.com/b' }),
      tab({ id: 3, url: 'https://youtube.com/watch' }),
    ];
    const actions = planGrouping(tabs, [], settings(), state());
    expect(actions).toEqual([
      { type: 'create', windowId: 1, title: 'github.com', color: expect.any(String), tabIds: [1, 2] },
    ]);
  });
  it('creates single-tab groups when minGroupSize is 1', () => {
    const actions = planGrouping([tab({ id: 1, url: 'https://a.com' })], [], settings({ minGroupSize: 1 }), state());
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('create');
  });
  it('skips pinned tabs, internal pages and incognito tabs unless enabled', () => {
    const tabs = [
      tab({ id: 1, url: 'https://a.com', pinned: true }),
      tab({ id: 2, url: 'https://a.com' }),
      tab({ id: 3, url: 'chrome://settings' }),
      tab({ id: 4, url: 'https://a.com', incognito: true }),
    ];
    expect(planGrouping(tabs, [], settings(), state())).toEqual([]);
    expect(planGrouping(tabs, [], settings({ includeIncognito: true }), state())).toEqual([
      expect.objectContaining({ type: 'create', tabIds: [2, 4] }),
    ]);
  });
  it('joins an existing group with the same title even for a single tab', () => {
    const tabs = [tab({ id: 1, url: 'https://github.com/x' }), tab({ id: 2, url: 'https://github.com/y', groupId: 10 })];
    const groups = [group({ id: 10, title: 'GitHub.com' })];
    expect(planGrouping(tabs, groups, settings(), state({ managedGroupIds: new Set([10]) }))).toEqual([
      { type: 'join', groupId: 10, tabIds: [1] },
    ]);
  });
  it("joins the user's own group when its title matches, but never pulls tabs out of it", () => {
    const tabs = [
      tab({ id: 1, url: 'https://github.com/x' }),
      tab({ id: 2, url: 'https://youtube.com/', groupId: 20 }), // user put a youtube tab in "github.com"
    ];
    const groups = [group({ id: 20, title: 'github.com' })];
    expect(planGrouping(tabs, groups, settings(), state())).toEqual([{ type: 'join', groupId: 20, tabIds: [1] }]);
  });
  it('leaves manually overridden tabs alone', () => {
    const tabs = [tab({ id: 1, url: 'https://a.com' }), tab({ id: 2, url: 'https://a.com' })];
    expect(planGrouping(tabs, [], settings(), state({ overriddenTabIds: new Set([1]) }))).toEqual([]);
  });
  it('moves a tab out of a managed group when it navigates to another domain', () => {
    const tabs = [
      tab({ id: 1, url: 'https://youtube.com/w', groupId: 10 }), // was github, now youtube
      tab({ id: 2, url: 'https://github.com/y', groupId: 10 }),
      tab({ id: 3, url: 'https://youtube.com/z', groupId: 11 }),
    ];
    const groups = [group({ id: 10, title: 'github.com' }), group({ id: 11, title: 'youtube.com' })];
    const actions = planGrouping(tabs, groups, settings(), state({ managedGroupIds: new Set([10, 11]) }));
    expect(actions).toEqual([{ type: 'join', groupId: 11, tabIds: [1] }]);
  });
  it('ungroups a mis-grouped tab when there are too few tabs to create its group', () => {
    const tabs = [tab({ id: 1, url: 'https://youtube.com/w', groupId: 10 }), tab({ id: 2, url: 'https://github.com/y', groupId: 10 })];
    const groups = [group({ id: 10, title: 'github.com' })];
    const actions = planGrouping(tabs, groups, settings(), state({ managedGroupIds: new Set([10]) }));
    expect(actions).toEqual([{ type: 'ungroup', tabIds: [1] }]);
  });
  it('does nothing when every tab is already in the right managed group', () => {
    const tabs = [tab({ id: 1, url: 'https://a.com/1', groupId: 5 }), tab({ id: 2, url: 'https://a.com/2', groupId: 5 })];
    expect(planGrouping(tabs, [group({ id: 5, title: 'a.com' })], settings(), state({ managedGroupIds: new Set([5]) }))).toEqual([]);
  });
  it('applies rules with their colour and keeps domain fallback for the rest', () => {
    const s = settings({ rules: [rule({ name: 'Dev', pattern: 'github.com', color: 'blue' })] });
    const tabs = [
      tab({ id: 1, url: 'https://github.com/a' }),
      tab({ id: 2, url: 'https://gist.github.com/b' }),
      tab({ id: 3, url: 'https://news.ycombinator.com/' }),
      tab({ id: 4, url: 'https://news.ycombinator.com/item?id=1' }),
    ];
    expect(planGrouping(tabs, [], s, state())).toEqual([
      { type: 'create', windowId: 1, title: 'Dev', color: 'blue', tabIds: [1, 2] },
      { type: 'create', windowId: 1, title: 'ycombinator.com', color: expect.any(String), tabIds: [3, 4] },
    ]);
  });
  it('does nothing when grouping would only touch chrome pages in managed groups', () => {
    const tabs = [tab({ id: 1, url: 'chrome://newtab', groupId: 5 })];
    expect(planGrouping(tabs, [group({ id: 5, title: 'a.com' })], settings(), state({ managedGroupIds: new Set([5]) }))).toEqual([]);
  });
});
