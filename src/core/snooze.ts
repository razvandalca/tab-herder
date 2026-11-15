import type { GroupColor, SavedTab } from '@/shared/types';

/** A closed tab or group waiting to be reopened at `wakeAt`. Stored in chrome.storage.local. */
export interface SnoozedItem {
  id: string;
  kind: 'tab' | 'group';
  snoozedAt: number;
  wakeAt: number;
  /** Set when the item was a group (or a tab inside one): reopened with this title and colour. */
  group?: { title: string; color: GroupColor; collapsed: boolean };
  tabs: SavedTab[];
}

export type SnoozePreset = 'laterToday' | 'tonight' | 'tomorrow' | 'nextWeek';

export const SNOOZE_PRESETS: Array<{ id: SnoozePreset; label: string }> = [
  { id: 'laterToday', label: 'Later today' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow', label: 'Tomorrow morning' },
  { id: 'nextWeek', label: 'Next week' },
];

const HOUR = 3_600_000;
const LATER_TODAY_HOURS = 3;
const EVENING_HOUR = 19;
const MORNING_HOUR = 9;
/** "Tonight" is only today if it is at least this far away; otherwise it means tomorrow evening. */
const TONIGHT_MIN_LEAD = 30 * 60_000;

function atHour(base: Date, dayOffset: number, hour: number): number {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, 0, 0, 0).getTime();
}

/** Wake time (ms) for a preset, in the local time zone. Always in the future. */
export function presetWakeTime(preset: SnoozePreset, now: number): number {
  const d = new Date(now);
  switch (preset) {
    case 'laterToday': {
      // Round to the minute so the label reads cleanly.
      const t = now + LATER_TODAY_HOURS * HOUR;
      return Math.ceil(t / 60_000) * 60_000;
    }
    case 'tonight': {
      const today = atHour(d, 0, EVENING_HOUR);
      return today - now >= TONIGHT_MIN_LEAD ? today : atHour(d, 1, EVENING_HOUR);
    }
    case 'tomorrow':
      return atHour(d, 1, MORNING_HOUR);
    case 'nextWeek': {
      // Next Monday morning; on a Monday that is a week away.
      const daysToMonday = ((8 - d.getDay()) % 7) || 7;
      return atHour(d, daysToMonday, MORNING_HOUR);
    }
  }
}

/** Parses an <input type="datetime-local"> value ("YYYY-MM-DDTHH:MM[:SS]") as local time. */
export function parseLocalDateTime(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x))) as number[];
  const date = new Date(y!, mo! - 1, d!, h!, mi!, s!, 0);
  // Reject overflow such as 2026-02-31 that Date silently rolls over.
  if (date.getMonth() !== mo! - 1 || date.getDate() !== d! || date.getHours() !== h! || date.getMinutes() !== mi!) return null;
  return date.getTime();
}

/** Formats a time as a datetime-local input value (local time, minute precision). */
export function toLocalDateTimeValue(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Validates a requested wake time; returns an error message or null. */
export function validateWakeTime(wakeAt: number, now: number): string | null {
  if (!Number.isFinite(wakeAt)) return 'Invalid time';
  if (wakeAt <= now) return 'Pick a time in the future';
  return null;
}

/** Items whose wake time has arrived (including ones that passed while the browser was closed). */
export function dueItems(items: SnoozedItem[], now: number): SnoozedItem[] {
  return items.filter((i) => i.wakeAt <= now);
}

/** Earliest wake time, or null when nothing is snoozed. */
export function nextWakeTime(items: SnoozedItem[]): number | null {
  let min: number | null = null;
  for (const i of items) if (min === null || i.wakeAt < min) min = i.wakeAt;
  return min;
}

/** Soonest first. */
export function sortSnoozed(items: SnoozedItem[]): SnoozedItem[] {
  return [...items].sort((a, b) => a.wakeAt - b.wakeAt);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short human label: "Today 19:00", "Tomorrow 09:00", "Mon 23 Nov 09:00". */
export function describeWake(ts: number, now: number): string {
  const d = new Date(ts);
  const n = new Date(now);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dayDiff = Math.round((atHour(d, 0, 0) - atHour(n, 0, 0)) / (24 * HOUR));
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  const year = d.getFullYear() !== n.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year} ${time}`;
}

/** Title shown in the snoozed list. */
export function snoozedLabel(item: SnoozedItem): string {
  if (item.kind === 'group') {
    const name = item.group?.title || 'Untitled group';
    return `${name} (${item.tabs.length} ${item.tabs.length === 1 ? 'tab' : 'tabs'})`;
  }
  const t = item.tabs[0];
  return t ? t.title || t.url : 'Empty';
}
