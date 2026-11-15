import { describe, expect, it } from 'vitest';
import {
  SNOOZE_PRESETS, describeWake, dueItems, nextWakeTime, parseLocalDateTime, presetWakeTime, snoozedLabel, sortSnoozed,
  toLocalDateTimeValue, validateWakeTime, type SnoozedItem,
} from '@/core/snooze';

// Local-time constructor so the tests pass in any time zone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
// 2026-11-18 is a Wednesday.
const WED_10 = at(2026, 11, 18, 10, 0);

const item = (partial: Partial<SnoozedItem> & { wakeAt: number }): SnoozedItem => ({
  id: String(partial.wakeAt),
  kind: 'tab',
  snoozedAt: 0,
  tabs: [{ url: 'https://a.com/', title: 'A', pinned: false }],
  ...partial,
});

describe('presetWakeTime', () => {
  it('later today is three hours ahead, rounded up to the minute', () => {
    expect(presetWakeTime('laterToday', WED_10)).toBe(at(2026, 11, 18, 13, 0));
    expect(presetWakeTime('laterToday', WED_10 + 1_500)).toBe(at(2026, 11, 18, 13, 1));
  });

  it('tonight is 19:00 today, or tomorrow evening when it is too close or past', () => {
    expect(presetWakeTime('tonight', WED_10)).toBe(at(2026, 11, 18, 19));
    expect(presetWakeTime('tonight', at(2026, 11, 18, 18, 30))).toBe(at(2026, 11, 18, 19));
    expect(presetWakeTime('tonight', at(2026, 11, 18, 18, 45))).toBe(at(2026, 11, 19, 19));
    expect(presetWakeTime('tonight', at(2026, 11, 18, 23))).toBe(at(2026, 11, 19, 19));
  });

  it('tomorrow morning is 09:00 the next day, across month and year ends', () => {
    expect(presetWakeTime('tomorrow', WED_10)).toBe(at(2026, 11, 19, 9));
    expect(presetWakeTime('tomorrow', at(2026, 11, 30, 1))).toBe(at(2026, 12, 1, 9));
    expect(presetWakeTime('tomorrow', at(2026, 12, 31, 23))).toBe(at(2027, 1, 1, 9));
  });

  it('next week is the coming Monday at 09:00, a full week ahead on Mondays', () => {
    expect(presetWakeTime('nextWeek', WED_10)).toBe(at(2026, 11, 23, 9));
    expect(presetWakeTime('nextWeek', at(2026, 11, 22, 12))).toBe(at(2026, 11, 23, 9)); // Sunday
    expect(presetWakeTime('nextWeek', at(2026, 11, 23, 8))).toBe(at(2026, 11, 30, 9)); // Monday
    expect(presetWakeTime('nextWeek', at(2026, 11, 21, 12))).toBe(at(2026, 11, 23, 9)); // Saturday
  });

  it('every preset lands in the future at any hour', () => {
    for (let h = 0; h < 24; h++) {
      const now = at(2026, 11, 18, h, 59);
      for (const p of SNOOZE_PRESETS) expect(presetWakeTime(p.id, now)).toBeGreaterThan(now);
    }
  });
});

describe('parseLocalDateTime / toLocalDateTimeValue', () => {
  it('parses datetime-local values as local time', () => {
    expect(parseLocalDateTime('2026-11-18T19:30')).toBe(at(2026, 11, 18, 19, 30));
    expect(parseLocalDateTime(' 2026-11-18T19:30:15 ')).toBe(at(2026, 11, 18, 19, 30) + 15_000);
  });

  it('rejects malformed or impossible dates', () => {
    expect(parseLocalDateTime('')).toBeNull();
    expect(parseLocalDateTime('2026-11-18')).toBeNull();
    expect(parseLocalDateTime('tomorrow')).toBeNull();
    expect(parseLocalDateTime('2026-02-31T10:00')).toBeNull();
    expect(parseLocalDateTime('2026-11-18T25:00')).toBeNull();
  });

  it('round-trips through the input format', () => {
    const v = toLocalDateTimeValue(at(2026, 1, 5, 7, 3));
    expect(v).toBe('2026-01-05T07:03');
    expect(parseLocalDateTime(v)).toBe(at(2026, 1, 5, 7, 3));
  });
});

describe('validateWakeTime', () => {
  it('requires a finite time in the future', () => {
    expect(validateWakeTime(WED_10 + 1, WED_10)).toBeNull();
    expect(validateWakeTime(WED_10, WED_10)).toMatch(/future/);
    expect(validateWakeTime(Number.NaN, WED_10)).toMatch(/Invalid/);
  });
});

describe('due / next / sort', () => {
  const items = [item({ wakeAt: 300 }), item({ wakeAt: 100 }), item({ wakeAt: 200 })];

  it('dueItems includes overdue items and items due exactly now', () => {
    expect(dueItems(items, 200).map((i) => i.wakeAt)).toEqual([100, 200]);
    expect(dueItems(items, 50)).toEqual([]);
  });

  it('nextWakeTime is the earliest, null when empty', () => {
    expect(nextWakeTime(items)).toBe(100);
    expect(nextWakeTime([])).toBeNull();
  });

  it('sortSnoozed orders soonest first without mutating', () => {
    expect(sortSnoozed(items).map((i) => i.wakeAt)).toEqual([100, 200, 300]);
    expect(items[0]!.wakeAt).toBe(300);
  });
});

describe('describeWake', () => {
  it('uses Today / Tomorrow / a short date', () => {
    expect(describeWake(at(2026, 11, 18, 19), WED_10)).toBe('Today 19:00');
    expect(describeWake(at(2026, 11, 19, 9, 5), WED_10)).toBe('Tomorrow 09:05');
    expect(describeWake(at(2026, 11, 23, 9), WED_10)).toBe('Mon 23 Nov 09:00');
    expect(describeWake(at(2027, 1, 4, 9), WED_10)).toBe('Mon 4 Jan 2027 09:00');
  });
});

describe('snoozedLabel', () => {
  it('names groups with their tab count and tabs by title or url', () => {
    const tabs = [{ url: 'https://a.com/', title: 'A', pinned: false }, { url: 'https://b.com/', title: '', pinned: false }];
    expect(snoozedLabel(item({ wakeAt: 1, kind: 'group', group: { title: 'Work', color: 'blue', collapsed: false }, tabs }))).toBe('Work (2 tabs)');
    expect(snoozedLabel(item({ wakeAt: 1, kind: 'group', group: { title: '', color: 'blue', collapsed: false }, tabs: tabs.slice(0, 1) }))).toBe('Untitled group (1 tab)');
    expect(snoozedLabel(item({ wakeAt: 1 }))).toBe('A');
    expect(snoozedLabel(item({ wakeAt: 1, tabs: tabs.slice(1) }))).toBe('https://b.com/');
    expect(snoozedLabel(item({ wakeAt: 1, tabs: [] }))).toBe('Empty');
  });
});
