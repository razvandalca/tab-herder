import { describe, expect, it } from 'vitest';
import {
  DOMAINS_PER_DAY, GROUPS_PER_DAY, INSIGHTS_RETENTION_DAYS, SAMPLE_INTERVAL_MS, UNTITLED_GROUP,
  addSample, bandPath, bumpDay, dayKey, emptyInsights, lastDayKeys, linePath, niceMax, normalizeInsights,
  pruneDays, shouldSample, summarize, takeSample, topEntries, xAt,
} from '@/core/insights';
import { group, tab } from './helpers';

const NOON = new Date(2026, 10, 15, 12, 0, 0).getTime(); // 2026-11-15 local
const DAY = 86_400_000;

describe('day keys', () => {
  it('formats local dates', () => {
    expect(dayKey(NOON)).toBe('2026-11-15');
    expect(dayKey(new Date(2026, 0, 5, 0, 1).getTime())).toBe('2026-01-05');
  });
  it('lists the last n days oldest first, across month ends', () => {
    expect(lastDayKeys(3, new Date(2026, 2, 1, 23, 30).getTime())).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(lastDayKeys(1, NOON)).toEqual(['2026-11-15']);
  });
});

describe('normalizeInsights', () => {
  it('returns empty data for garbage', () => {
    expect(normalizeInsights(undefined)).toEqual(emptyInsights());
    expect(normalizeInsights({ version: 2 })).toEqual(emptyInsights());
    expect(normalizeInsights([1])).toEqual(emptyInsights());
  });
  it('keeps valid days and drops malformed ones', () => {
    const raw = {
      version: 1,
      paused: true,
      lastSampleAt: 5,
      days: {
        '2026-11-15': { n: 2, sum: 10, min: 4, max: 6, domains: { 'a.com': 3, bad: 'x' }, groups: 'nope' },
        'not-a-date': { n: 1, sum: 1, min: 1, max: 1 },
        '2026-11-14': { n: 1 },
        '2026-11-13': 7,
      },
    };
    expect(normalizeInsights(raw)).toEqual({
      version: 1,
      paused: true,
      lastSampleAt: 5,
      days: { '2026-11-15': { n: 2, sum: 10, min: 4, max: 6, domains: { 'a.com': 3 }, groups: {} } },
    });
  });
  it('defaults missing fields', () => {
    expect(normalizeInsights({ version: 1, days: 3 })).toEqual(emptyInsights());
  });
});

describe('takeSample', () => {
  it('counts base domains and group sizes, skipping incognito and non-web tabs', () => {
    const tabs = [
      tab({ url: 'https://github.com/a', groupId: 1 }),
      tab({ url: 'https://docs.github.com/b', groupId: 1 }),
      tab({ url: 'https://www.bbc.co.uk/news', groupId: 2 }),
      tab({ url: 'chrome://settings' }),
      tab({ url: 'https://secret.com', incognito: true, groupId: 3 }),
      tab({ url: 'https://', groupId: 4 }),
    ];
    const groups = [
      group({ id: 1, title: 'Code' }),
      group({ id: 2, title: '  ' }),
      group({ id: 3, title: 'Private' }),
      group({ id: 4, title: 'Code', windowId: 2 }),
      group({ id: 5, title: 'Empty' }),
    ];
    expect(takeSample(tabs, groups)).toEqual({
      total: 5,
      domains: { 'github.com': 2, 'bbc.co.uk': 1 },
      groups: { Code: 2, [UNTITLED_GROUP]: 1 },
    });
  });
});

describe('topEntries / pruneDays', () => {
  it('sorts by value then key', () => {
    expect(topEntries({ b: 2, a: 2, c: 5, d: 1 }, 3)).toEqual([['c', 5], ['a', 2], ['b', 2]]);
  });
  it('keeps exactly keepDays days', () => {
    const days = { '2026-11-15': 1, '2026-11-14': 2, '2026-11-13': 3, '2026-10-01': 4 };
    expect(pruneDays(days, 2, NOON)).toEqual({ '2026-11-15': 1, '2026-11-14': 2 });
  });
});

describe('addSample', () => {
  it('aggregates min/avg/max, sums domains and keeps max group size', () => {
    let d = emptyInsights();
    d = addSample(d, { total: 10, domains: { 'a.com': 4, 'b.com': 1 }, groups: { G: 3 } }, NOON);
    d = addSample(d, { total: 4, domains: { 'a.com': 2 }, groups: { G: 2, H: 1 } }, NOON + 1000);
    expect(d.lastSampleAt).toBe(NOON + 1000);
    expect(d.days['2026-11-15']).toEqual({ n: 2, sum: 14, min: 4, max: 10, domains: { 'a.com': 6, 'b.com': 1 }, groups: { G: 3, H: 1 } });
  });
  it('starts a new day and prunes beyond retention', () => {
    let d = addSample(emptyInsights(), { total: 1, domains: {}, groups: {} }, NOON - INSIGHTS_RETENTION_DAYS * DAY);
    d = addSample(d, { total: 2, domains: {}, groups: {} }, NOON - DAY);
    d = addSample(d, { total: 3, domains: {}, groups: {} }, NOON);
    expect(Object.keys(d.days).sort()).toEqual(['2026-11-14', '2026-11-15']);
  });
  it('trims per-day domain and group maps', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`d${i}.com`, i + 1]));
    const d = addSample(emptyInsights(), { total: 1, domains: many(50), groups: many(40) }, NOON);
    expect(Object.keys(d.days['2026-11-15']!.domains)).toHaveLength(DOMAINS_PER_DAY);
    expect(Object.keys(d.days['2026-11-15']!.groups)).toHaveLength(GROUPS_PER_DAY);
    expect(d.days['2026-11-15']!.domains['d49.com']).toBe(50);
    expect(d.days['2026-11-15']!.domains['d0.com']).toBeUndefined();
  });
});

describe('shouldSample', () => {
  it('throttles, respects pause and clock jumps', () => {
    const d = { ...emptyInsights(), lastSampleAt: NOON };
    expect(shouldSample(d, NOON + 1000)).toBe(false);
    expect(shouldSample(d, NOON + 1000, true)).toBe(true);
    expect(shouldSample(d, NOON + SAMPLE_INTERVAL_MS)).toBe(true);
    expect(shouldSample(d, NOON - 5000)).toBe(true);
    expect(shouldSample({ ...d, paused: true }, NOON + DAY, true)).toBe(false);
  });
});

describe('bumpDay', () => {
  it('adds to today and prunes', () => {
    expect(bumpDay({ '2026-11-15': 2, '2026-01-01': 9 }, 3, NOON, 90)).toEqual({ '2026-11-15': 5 });
    expect(bumpDay({}, 1, NOON, 90)).toEqual({ '2026-11-15': 1 });
  });
});

describe('summarize', () => {
  it('builds a per-day series with gaps, domain averages and biggest groups', () => {
    const data = normalizeInsights({
      version: 1,
      days: {
        '2026-11-13': { n: 2, sum: 20, min: 8, max: 12, domains: { 'a.com': 8, 'b.com': 2 }, groups: { G: 4 } },
        '2026-11-15': { n: 1, sum: 6, min: 6, max: 6, domains: { 'a.com': 2, 'c.com': 3 }, groups: { G: 6, H: 2 } },
        '2026-10-01': { n: 1, sum: 99, min: 99, max: 99, domains: { 'old.com': 99 }, groups: { Old: 99 } },
        '2026-11-14': { n: 0, sum: 0, min: 0, max: 0 },
      },
    });
    const s = summarize(data, { closedByDay: { '2026-11-14': 3, '2026-11-15': 1 }, discardedByDay: { '2026-11-15': 4 } }, 3, NOON);
    expect(s.days).toEqual([
      { key: '2026-11-13', min: 8, avg: 10, max: 12, closed: 0, discarded: 0 },
      { key: '2026-11-14', min: null, avg: null, max: null, closed: 3, discarded: 0 },
      { key: '2026-11-15', min: 6, avg: 6, max: 6, closed: 1, discarded: 4 },
    ]);
    // a.com: (8/2 + 2/1) / 2 days = 3; c.com: 3; b.com: 1
    expect(s.topDomains).toEqual([{ domain: 'a.com', avg: 3 }, { domain: 'c.com', avg: 3 }, { domain: 'b.com', avg: 1 }]);
    expect(s.biggestGroups).toEqual([{ title: 'G', size: 6 }, { title: 'H', size: 2 }]);
    expect(s.totals).toEqual({ closed: 4, discarded: 4, samples: 3 });
  });
  it('limits list lengths', () => {
    const data = addSample(emptyInsights(), { total: 3, domains: { a: 1, b: 2, c: 3 }, groups: { x: 1, y: 2 } }, NOON);
    const s = summarize(data, { closedByDay: {}, discardedByDay: {} }, 7, NOON, 1);
    expect(s.topDomains).toEqual([{ domain: 'c', avg: 3 }]);
    expect(s.biggestGroups).toEqual([{ title: 'y', size: 2 }]);
    expect(s.days).toHaveLength(7);
  });
});

describe('chart helpers', () => {
  it('niceMax rounds up to 1/2/5 steps', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(17)).toBe(20);
    expect(niceMax(51)).toBe(100);
    expect(niceMax(0.3)).toBeCloseTo(0.5);
  });
  it('xAt centres a single point', () => {
    expect(xAt(0, 1, 100)).toBe(50);
    expect(xAt(2, 3, 100)).toBe(100);
  });
  it('linePath breaks on nulls', () => {
    expect(linePath([0, 10, null, 5], 30, 10, 10)).toBe('M0,10L10,0M30,5');
    expect(linePath([null], 30, 10, 10)).toBe('');
  });
  it('bandPath closes one shape per run', () => {
    expect(bandPath([0, 0, null, 2], [10, 10, null, 4], 30, 10, 10)).toBe('M0,0L10,0L10,10L0,10ZM30,6L30,8Z');
    expect(bandPath([], [], 30, 10, 10)).toBe('');
  });
});
