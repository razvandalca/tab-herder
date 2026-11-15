import { describe, expect, it } from 'vitest';
import { addClosedSessions, buildClosedSessions, groupsLabel, isSavable } from '@/core/sessions';
import type { Session } from '@/shared/types';
import { group, tab } from './helpers';

let n = 0;
const opts = { now: 1000, newId: () => `s${++n}` };

describe('isSavable', () => {
  it('accepts web and file urls, rejects chrome pages', () => {
    expect(isSavable({ url: 'https://a.com' })).toBe(true);
    expect(isSavable({ url: 'file:///x' })).toBe(true);
    expect(isSavable({ url: 'chrome://newtab/' })).toBe(false);
  });
});

describe('groupsLabel', () => {
  it('lists titles, falls back to Untitled and summarises extras', () => {
    expect(groupsLabel([{ title: 'Work' }])).toBe('Work');
    expect(groupsLabel([{ title: 'Work' }, { title: ' ' }])).toBe('Work, Untitled');
    expect(groupsLabel([{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }])).toBe('A, B +2');
  });
});

describe('buildClosedSessions', () => {
  it('records title, colour, collapsed state and tabs in order', () => {
    const tabs = [
      tab({ id: 11, index: 2, url: 'https://b.com/2', groupId: 1 }),
      tab({ id: 10, index: 1, url: 'https://b.com/1', groupId: 1, title: 'B1' }),
      tab({ id: 12, index: 0, url: 'https://loose.com' }),
    ];
    const [s, ...rest] = buildClosedSessions(tabs, [group({ id: 1, title: 'Work', color: 'red', collapsed: true })], opts);
    expect(rest).toEqual([]);
    expect(s).toMatchObject({ name: 'Closed: Work', kind: 'group', createdAt: 1000, autoSaved: true, windowId: 1, ungrouped: [] });
    expect(s!.groups).toEqual([
      { title: 'Work', color: 'red', collapsed: true, tabs: [
        { url: 'https://b.com/1', title: 'B1', pinned: false, favIconUrl: undefined },
        { url: 'https://b.com/2', title: 'https://b.com/2', pinned: false, favIconUrl: undefined },
      ] },
    ]);
  });

  it('keeps groups in tab-strip order, one session per window, skipping unsavable groups', () => {
    const tabs = [
      tab({ id: 1, index: 5, url: 'https://a.com', groupId: 1 }),
      tab({ id: 2, index: 1, url: 'https://b.com', groupId: 2 }),
      tab({ id: 3, index: 0, url: 'chrome://settings', groupId: 3 }),
      tab({ id: 4, index: 0, url: 'https://c.com', groupId: 4, windowId: 2 }),
    ];
    const groups = [
      group({ id: 1, title: 'A' }),
      group({ id: 2, title: 'B' }),
      group({ id: 3, title: 'Chrome' }),
      group({ id: 4, title: 'C', windowId: 2 }),
      group({ id: 5, title: 'Empty' }),
    ];
    const out = buildClosedSessions(tabs, groups, opts);
    expect(out.map((s) => [s.windowId, s.kind, s.name, s.groups.map((g) => g.title)])).toEqual([
      [1, 'window', 'Closed: B, A', ['B', 'A']],
      [2, 'group', 'Closed: C', ['C']],
    ]);
  });

  it('returns nothing when no group has reopenable tabs', () => {
    expect(buildClosedSessions([tab({ url: 'chrome://newtab/', groupId: 1 })], [group({ id: 1, title: 'X' })], opts)).toEqual([]);
  });
});

describe('addClosedSessions', () => {
  const s = (id: string, autoSaved?: boolean): Session => ({ id, name: id, createdAt: 0, kind: 'group', groups: [], ungrouped: [], autoSaved });

  it('prepends and caps only auto-saved sessions, keeping the newest', () => {
    const existing = [s('m1'), s('a1', true), s('m2'), s('a2', true)];
    expect(addClosedSessions(existing, [s('new', true)], 2).map((x) => x.id)).toEqual(['new', 'm1', 'a1', 'm2']);
  });

  it('never drops manual sessions', () => {
    expect(addClosedSessions([s('m1'), s('m2')], [], 0).map((x) => x.id)).toEqual(['m1', 'm2']);
  });
});
