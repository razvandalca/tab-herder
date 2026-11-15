import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTOSAVE_KEEP_MAX, autosaveLabel, buildAutosaveWindows, buildWindowSnapshot, clampKeep, fingerprint, hash,
  isSavableUrl, pruneAutosaves, shouldAutosave, tabCount,
} from '@/core/autosave';
import type { Autosave, WindowSnapshot } from '@/shared/types';
import { group, resetIds, tab } from './helpers';

beforeEach(resetIds);

const autosave = (createdAt: number, windows: WindowSnapshot[] = []): Autosave => ({
  id: `a${createdAt}`,
  createdAt,
  fingerprint: fingerprint(windows),
  windows,
});

describe('isSavableUrl', () => {
  it('accepts web and file URLs only', () => {
    expect(isSavableUrl('https://a.com')).toBe(true);
    expect(isSavableUrl('http://a.com')).toBe(true);
    expect(isSavableUrl('file:///tmp/x')).toBe(true);
    expect(isSavableUrl('chrome://newtab/')).toBe(false);
    expect(isSavableUrl('')).toBe(false);
  });
});

describe('buildWindowSnapshot', () => {
  it('keeps tab order, groups with title/colour/collapsed, and ungrouped tabs', () => {
    const w = buildWindowSnapshot(
      [
        tab({ url: 'https://b.com', index: 2, groupId: 7 }),
        tab({ url: 'https://a.com', index: 1, groupId: 7, favIconUrl: 'https://a.com/f.ico' }),
        tab({ url: 'https://c.com', index: 3, pinned: true }),
        tab({ url: 'chrome://settings', index: 4 }),
      ],
      [group({ id: 7, title: 'Work', color: 'red', collapsed: true }), group({ id: 8, title: 'Empty' })],
    );
    expect(w.groups).toEqual([
      {
        title: 'Work',
        color: 'red',
        collapsed: true,
        tabs: [
          { url: 'https://a.com', title: 'https://a.com', pinned: false, favIconUrl: 'https://a.com/f.ico' },
          { url: 'https://b.com', title: 'https://b.com', pinned: false },
        ],
      },
    ]);
    expect(w.ungrouped).toEqual([{ url: 'https://c.com', title: 'https://c.com', pinned: true }]);
    expect(tabCount(w)).toBe(3);
  });

  it('can drop favicons', () => {
    const w = buildWindowSnapshot([tab({ url: 'https://a.com', favIconUrl: 'data:image/png;base64,xx' })], [], { favicons: false });
    expect(w.ungrouped[0]).not.toHaveProperty('favIconUrl');
  });
});

describe('buildAutosaveWindows', () => {
  it('snapshots each window separately, skipping incognito and empty windows', () => {
    const windows = buildAutosaveWindows(
      [
        tab({ url: 'https://w2.com', windowId: 2, groupId: 5, favIconUrl: 'https://w2.com/f.ico' }),
        tab({ url: 'https://w1.com', windowId: 1 }),
        tab({ url: 'https://secret.com', windowId: 3, incognito: true }),
        tab({ url: 'chrome://newtab/', windowId: 4 }),
      ],
      [group({ id: 5, windowId: 2, title: 'G', color: 'green' })],
    );
    expect(windows).toHaveLength(2);
    expect(windows[0]!.ungrouped.map((t) => t.url)).toEqual(['https://w1.com']);
    expect(windows[1]!.groups[0]).toMatchObject({ title: 'G', color: 'green' });
    expect(windows[1]!.groups[0]!.tabs[0]).not.toHaveProperty('favIconUrl');
    expect(JSON.stringify(windows)).not.toContain('secret');
  });

  it('returns nothing when no tab can be reopened', () => {
    expect(buildAutosaveWindows([tab({ url: 'chrome://newtab/' })], [])).toEqual([]);
  });
});

describe('fingerprint / change detection', () => {
  const base = (): WindowSnapshot[] => [
    {
      groups: [{ title: 'Dev', color: 'blue', collapsed: false, tabs: [{ url: 'https://a.com', title: 'A', pinned: false }] }],
      ungrouped: [{ url: 'https://b.com', title: 'B', pinned: false }],
    },
  ];

  it('is stable and ignores tab titles and favicons', () => {
    const changed = base();
    changed[0]!.ungrouped[0]!.title = '(3) B';
    changed[0]!.ungrouped[0]!.favIconUrl = 'x';
    expect(fingerprint(base())).toBe(fingerprint(base()));
    expect(fingerprint(changed)).toBe(fingerprint(base()));
  });

  it('changes with URLs, pinning, order and group properties', () => {
    const f = fingerprint(base());
    const url = base();
    url[0]!.ungrouped[0]!.url = 'https://c.com';
    const pin = base();
    pin[0]!.ungrouped[0]!.pinned = true;
    const color = base();
    color[0]!.groups[0]!.color = 'red';
    const title = base();
    title[0]!.groups[0]!.title = 'Ops';
    const collapsed = base();
    collapsed[0]!.groups[0]!.collapsed = true;
    const moreWindows = [...base(), ...base()];
    for (const w of [url, pin, color, title, collapsed, moreWindows]) expect(fingerprint(w)).not.toBe(f);
  });

  it('shouldAutosave skips empty snapshots and unchanged state', () => {
    expect(shouldAutosave([], [])).toBe(false);
    expect(shouldAutosave(base(), [])).toBe(true);
    expect(shouldAutosave(base(), [autosave(1, base())])).toBe(false);
    const other = base();
    other[0]!.ungrouped = [];
    // Compares against the newest autosave regardless of array order.
    expect(shouldAutosave(base(), [autosave(1, base()), autosave(2, other)])).toBe(true);
    expect(shouldAutosave(base(), [autosave(2, base()), autosave(1, other)])).toBe(false);
  });

  it('hash is 8 hex chars', () => {
    expect(hash('')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash('a')).not.toBe(hash('b'));
  });
});

describe('pruneAutosaves', () => {
  it('keeps the newest N, newest first', () => {
    const list = [autosave(3), autosave(1), autosave(5), autosave(2), autosave(4)];
    expect(pruneAutosaves(list, 3).map((a) => a.createdAt)).toEqual([5, 4, 3]);
    expect(pruneAutosaves(list, 10)).toHaveLength(5);
  });

  it('clamps nonsense retention values', () => {
    expect(clampKeep(0)).toBe(1);
    expect(clampKeep(-4)).toBe(1);
    expect(clampKeep(2.7)).toBe(2);
    expect(clampKeep(Number.NaN)).toBe(1);
    expect(clampKeep(1000)).toBe(AUTOSAVE_KEEP_MAX);
    expect(pruneAutosaves([autosave(1), autosave(2)], 0)).toHaveLength(1);
  });
});

describe('autosaveLabel', () => {
  it('formats as "Autosave – <time>"', () => {
    const at = new Date(2026, 10, 15, 9, 30).getTime();
    expect(autosaveLabel({ createdAt: at }, 'en-US')).toBe(`Autosave – ${new Date(at).toLocaleString('en-US')}`);
  });
});
