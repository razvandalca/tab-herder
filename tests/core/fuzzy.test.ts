import { describe, expect, it } from 'vitest';
import { fuzzyScore, fuzzySearch } from '@/core/fuzzy';

describe('fuzzyScore', () => {
  it('scores substring matches above subsequence matches and non-matches at 0', () => {
    expect(fuzzyScore('git', 'GitHub - home')).toBeGreaterThan(fuzzyScore('gth', 'GitHub - home'));
    expect(fuzzyScore('gth', 'GitHub - home')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'GitHub - home')).toBe(0);
    expect(fuzzyScore('', 'anything')).toBe(1);
  });
  it('prefers matches at word starts', () => {
    expect(fuzzyScore('hub', 'hub central')).toBeGreaterThan(fuzzyScore('hub', 'github'));
  });
});

describe('fuzzySearch', () => {
  const items = [
    { title: 'GitHub - pulls', url: 'https://github.com/pulls' },
    { title: 'YouTube', url: 'https://youtube.com/' },
    { title: 'Issue tracker', url: 'https://gitlab.com/x/issues' },
  ];
  it('filters and ranks across title and url, supporting multiple terms', () => {
    expect(fuzzySearch('github', items).map((i) => i.title)).toEqual(['GitHub - pulls']);
    expect(fuzzySearch('git', items).map((i) => i.title)).toEqual(['GitHub - pulls', 'Issue tracker']);
    expect(fuzzySearch('git issues', items).map((i) => i.title)).toEqual(['Issue tracker']);
    expect(fuzzySearch('zzz', items)).toEqual([]);
  });
  it('returns everything (up to the limit) for an empty query', () => {
    expect(fuzzySearch('', items, 2)).toHaveLength(2);
  });
});
