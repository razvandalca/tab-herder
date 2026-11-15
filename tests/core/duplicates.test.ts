import { beforeEach, describe, expect, it } from 'vitest';
import { duplicateTabIds, findDuplicates } from '@/core/duplicates';
import { resetIds, tab } from './helpers';

beforeEach(resetIds);

describe('findDuplicates', () => {
  it('groups tabs by normalised URL and keeps the oldest by default', () => {
    const tabs = [
      tab({ id: 1, url: 'https://a.com/x?utm_source=1' }),
      tab({ id: 2, url: 'https://a.com/x#top' }),
      tab({ id: 3, url: 'https://b.com/' }),
    ];
    expect(findDuplicates(tabs)).toEqual([{ key: 'https://a.com/x', keep: 1, close: [2] }]);
  });
  it('keeps the active tab over an older one, and a pinned tab over a plain one', () => {
    expect(duplicateTabIds([tab({ id: 1, url: 'https://a.com' }), tab({ id: 2, url: 'https://a.com', active: true })])).toEqual([1]);
    expect(duplicateTabIds([tab({ id: 1, url: 'https://a.com' }), tab({ id: 2, url: 'https://a.com', pinned: true })])).toEqual([1]);
  });
  it('never closes pinned or audible tabs', () => {
    const tabs = [
      tab({ id: 1, url: 'https://a.com', active: true }),
      tab({ id: 2, url: 'https://a.com', pinned: true }),
      tab({ id: 3, url: 'https://a.com', audible: true }),
      tab({ id: 4, url: 'https://a.com' }),
    ];
    expect(duplicateTabIds(tabs)).toEqual([4]);
  });
  it('ignores non-http tabs and reports nothing when there are no duplicates', () => {
    expect(findDuplicates([tab({ url: 'chrome://newtab' }), tab({ url: 'chrome://newtab' })])).toEqual([]);
    expect(findDuplicates([tab({ url: 'https://a.com' }), tab({ url: 'https://b.com' })])).toEqual([]);
  });
  it('finds duplicates across windows', () => {
    const tabs = [tab({ id: 1, url: 'https://a.com', windowId: 1 }), tab({ id: 2, url: 'https://a.com', windowId: 2 })];
    expect(duplicateTabIds(tabs)).toEqual([2]);
  });
});
