import { beforeEach, describe, expect, it } from 'vitest';
import { commonPrefix, sameItem, sortGroupTabs, sortWindowGroups, stripItems } from '@/core/sorting';
import { group, resetIds, tab } from './helpers';

beforeEach(resetIds);

describe('sortGroupTabs', () => {
  it('sorts by title, case-insensitively and with numbers in natural order', () => {
    const tabs = [
      tab({ url: 'https://a.com/1', title: 'zeta', groupId: 7 }),
      tab({ url: 'https://a.com/2', title: 'Item 10', groupId: 7 }),
      tab({ url: 'https://a.com/3', title: 'item 2', groupId: 7 }),
      tab({ url: 'https://a.com/4', title: 'Alpha', groupId: 7 }),
    ];
    expect(sortGroupTabs(tabs, 7, 'title')).toEqual([4, 3, 2, 1]);
  });

  it('puts untitled tabs last and keeps ties in strip order (stable)', () => {
    const tabs = [
      tab({ url: 'https://a.com/1', title: '', groupId: 1 }),
      tab({ url: 'https://a.com/2', title: 'Same', groupId: 1 }),
      tab({ url: 'https://a.com/3', title: 'same', groupId: 1 }),
      tab({ url: 'https://a.com/4', title: 'A', groupId: 1 }),
    ];
    expect(sortGroupTabs(tabs, 1, 'title')).toEqual([4, 2, 3, 1]);
  });

  it('uses strip index, not array order, as the starting order', () => {
    const tabs = [
      tab({ id: 1, index: 5, url: 'https://a.com', title: 'x', groupId: 1 }),
      tab({ id: 2, index: 3, url: 'https://b.com', title: 'x', groupId: 1 }),
    ];
    expect(sortGroupTabs(tabs, 1, 'title')).toEqual([2, 1]);
  });

  it('sorts by domain ignoring www, with non-web pages last', () => {
    const tabs = [
      tab({ url: 'chrome://settings', groupId: 2 }),
      tab({ url: 'https://www.zoo.org/a', groupId: 2 }),
      tab({ url: 'https://apple.com/b', groupId: 2 }),
      tab({ url: 'https://zoo.org/c', groupId: 2 }),
    ];
    expect(sortGroupTabs(tabs, 2, 'domain')).toEqual([3, 2, 4, 1]);
  });

  it('sorts by last used, most recent first, unknown last', () => {
    const tabs = [
      tab({ url: 'https://a.com/1', groupId: 3, lastAccessed: 100 }),
      tab({ url: 'https://a.com/2', groupId: 3 }),
      tab({ url: 'https://a.com/3', groupId: 3, lastAccessed: 300 }),
      tab({ url: 'https://a.com/4', groupId: 3 }),
      tab({ url: 'https://a.com/5', groupId: 3, lastAccessed: 100 }),
    ];
    expect(sortGroupTabs(tabs, 3, 'lastUsed')).toEqual([3, 1, 5, 2, 4]);
  });

  it('ignores pinned tabs, other groups and ungrouped tabs', () => {
    const tabs = [
      tab({ url: 'https://b.com', title: 'b', groupId: 1 }),
      tab({ url: 'https://a.com', title: 'a', groupId: 2 }),
      tab({ url: 'https://a.com', title: 'a', pinned: true, groupId: 1 }),
      tab({ url: 'https://a.com', title: 'a' }),
      tab({ url: 'https://c.com', title: 'a2', groupId: 1 }),
    ];
    expect(sortGroupTabs(tabs, 1, 'title')).toEqual([5, 1]);
    expect(sortGroupTabs(tabs, -1, 'title')).toEqual([]);
  });
});

describe('stripItems', () => {
  it('lists ungrouped tabs and groups of one window in order, without pinned tabs', () => {
    const tabs = [
      tab({ url: 'https://p.com', pinned: true }),
      tab({ url: 'https://a.com', groupId: 10 }),
      tab({ url: 'https://a.com', groupId: 10 }),
      tab({ url: 'https://u.com' }),
      tab({ url: 'https://b.com', groupId: 20 }),
      tab({ url: 'https://o.com', windowId: 2 }),
    ];
    expect(stripItems(tabs, 1)).toEqual([
      { kind: 'group', id: 10 },
      { kind: 'tab', id: 4 },
      { kind: 'group', id: 20 },
    ]);
  });
});

describe('sortWindowGroups', () => {
  const tabs = () => [
    tab({ url: 'https://p.com', pinned: true }), // 1
    tab({ url: 'https://z.com', groupId: 10 }), // 2
    tab({ url: 'https://u.com' }), // 3 ungrouped, stays in slot 2
    tab({ url: 'https://a.com', groupId: 20 }), // 4
    tab({ url: 'https://a.com', groupId: 20 }), // 5
    tab({ url: 'https://a.com', groupId: 20 }), // 6
    tab({ url: 'https://m.com', groupId: 30 }), // 7
    tab({ url: 'https://m.com', groupId: 30 }), // 8
    tab({ url: 'https://other.com', groupId: 99, windowId: 2 }),
  ];
  const groups = [
    group({ id: 10, title: 'Aardvark' }),
    group({ id: 20, title: 'alpha' }),
    group({ id: 30, title: 'Mid' }),
    group({ id: 99, title: 'Elsewhere', windowId: 2 }),
  ];

  it('sorts by name and leaves ungrouped tabs in their slots', () => {
    expect(sortWindowGroups(tabs(), groups, 1, 'name')).toEqual([
      { kind: 'group', id: 10 },
      { kind: 'tab', id: 3 },
      { kind: 'group', id: 20 },
      { kind: 'group', id: 30 },
    ]);
  });

  it('sorts by size, largest first', () => {
    expect(sortWindowGroups(tabs(), groups, 1, 'size')).toEqual([
      { kind: 'group', id: 20 },
      { kind: 'tab', id: 3 },
      { kind: 'group', id: 30 },
      { kind: 'group', id: 10 },
    ]);
  });

  it('keeps ties in current order and puts untitled groups last', () => {
    const t = [
      tab({ url: 'https://a.com', groupId: 1 }),
      tab({ url: 'https://a.com', groupId: 2 }),
      tab({ url: 'https://a.com', groupId: 3 }),
    ];
    const g = [group({ id: 1, title: '' }), group({ id: 2, title: 'Same' }), group({ id: 3, title: 'same' })];
    const ids = (k: 'name' | 'size') => sortWindowGroups(t, g, 1, k).map((i) => i.id);
    expect(ids('name')).toEqual([2, 3, 1]);
    expect(ids('size')).toEqual([1, 2, 3]);
  });

  it('tolerates groups missing from the group list', () => {
    const t = [tab({ url: 'https://a.com', groupId: 5 }), tab({ url: 'https://a.com', groupId: 6 })];
    expect(sortWindowGroups(t, [group({ id: 6, title: 'B' })], 1, 'name').map((i) => i.id)).toEqual([6, 5]);
  });
});

describe('commonPrefix', () => {
  it('counts equal leading entries', () => {
    expect(commonPrefix([1, 2, 3], [1, 2, 4])).toBe(2);
    expect(commonPrefix([1, 2], [1, 2])).toBe(2);
    expect(commonPrefix([], [1])).toBe(0);
  });

  it('compares strip items by kind and id', () => {
    const a = [{ kind: 'group' as const, id: 1 }, { kind: 'tab' as const, id: 2 }];
    const b = [{ kind: 'group' as const, id: 1 }, { kind: 'group' as const, id: 2 }];
    expect(commonPrefix(a, b, sameItem)).toBe(1);
  });
});
