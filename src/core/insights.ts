// Local-only usage insights: aggregate daily counts, never URLs or browsing history.
import type { GroupSnapshot, TabSnapshot } from '@/shared/types';
import { baseDomain, hostname, isGroupableUrl } from './url';

export const INSIGHTS_RETENTION_DAYS = 90;
/** Minimum spacing between two open-tab samples. */
export const SAMPLE_INTERVAL_MS = 10 * 60_000;
/** Domains / groups kept per day; everything below the cut is dropped. */
export const DOMAINS_PER_DAY = 30;
export const GROUPS_PER_DAY = 15;
export const UNTITLED_GROUP = '(untitled)';

export interface InsightsDay {
  /** Number of samples taken that day. */
  n: number;
  /** Sum / min / max of the open-tab count over the samples. */
  sum: number;
  min: number;
  max: number;
  /** Base domain -> open tabs summed over the samples (divide by n for the daily average). */
  domains: Record<string, number>;
  /** Group title -> largest size seen that day. */
  groups: Record<string, number>;
}

export interface InsightsData {
  version: 1;
  /** When true the background stops sampling. */
  paused: boolean;
  lastSampleAt: number;
  /** YYYY-MM-DD (local time) -> aggregates. */
  days: Record<string, InsightsDay>;
}

export interface Sample {
  total: number;
  domains: Record<string, number>;
  groups: Record<string, number>;
}

export function emptyInsights(paused = false): InsightsData {
  return { version: 1, paused, lastSampleAt: 0, days: {} };
}

/** Local-time YYYY-MM-DD. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The last `n` day keys ending today, oldest first (calendar-stepped, so DST-safe). */
export function lastDayKeys(n: number, now: number): string[] {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    keys.unshift(dayKey(d.getTime()));
    d.setDate(d.getDate() - 1);
  }
  return keys;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(v)) return out;
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  return out;
}

/** Accepts whatever is in storage and returns a well-formed InsightsData. */
export function normalizeInsights(raw: unknown): InsightsData {
  if (!isRecord(raw) || raw.version !== 1) return emptyInsights();
  const days: Record<string, InsightsDay> = {};
  if (isRecord(raw.days)) {
    for (const [k, d] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isRecord(d)) continue;
      const { n, sum, min, max } = d;
      if (typeof n !== 'number' || typeof sum !== 'number' || typeof min !== 'number' || typeof max !== 'number')
        continue;
      days[k] = { n, sum, min, max, domains: numberMap(d.domains), groups: numberMap(d.groups) };
    }
  }
  return {
    version: 1,
    paused: raw.paused === true,
    lastSampleAt: typeof raw.lastSampleAt === 'number' ? raw.lastSampleAt : 0,
    days,
  };
}

/** Counts tabs per base domain and per group title. Incognito tabs are never counted. */
export function takeSample(tabs: TabSnapshot[], groups: GroupSnapshot[]): Sample {
  const visible = tabs.filter((t) => !t.incognito);
  const domains: Record<string, number> = {};
  const sizeById = new Map<number, number>();
  for (const t of visible) {
    if (isGroupableUrl(t.url)) {
      const h = hostname(t.url);
      if (h) {
        const d = baseDomain(h);
        domains[d] = (domains[d] ?? 0) + 1;
      }
    }
    if (t.groupId >= 0) sizeById.set(t.groupId, (sizeById.get(t.groupId) ?? 0) + 1);
  }
  const groupsOut: Record<string, number> = {};
  for (const g of groups) {
    const size = sizeById.get(g.id);
    if (!size) continue;
    const title = g.title.trim() || UNTITLED_GROUP;
    groupsOut[title] = Math.max(groupsOut[title] ?? 0, size);
  }
  return { total: visible.length, domains, groups: groupsOut };
}

/** Keeps the `n` largest entries (ties broken by key, for determinism). */
export function topEntries(map: Record<string, number>, n: number): Array<[string, number]> {
  return Object.entries(map)
    .sort(([ak, av], [bk, bv]) => bv - av || ak.localeCompare(bk))
    .slice(0, n);
}

function topMap(map: Record<string, number>, n: number): Record<string, number> {
  return Object.fromEntries(topEntries(map, n));
}

/** Drops days older than `keepDays` (today counts as day 1). */
export function pruneDays<T>(days: Record<string, T>, keepDays: number, now: number): Record<string, T> {
  const cutoff = lastDayKeys(Math.max(1, keepDays), now)[0] ?? '';
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(days)) if (k >= cutoff) out[k] = v;
  return out;
}

/** Folds one sample into today's aggregates, trims per-day maps and prunes old days. Pure. */
export function addSample(data: InsightsData, sample: Sample, now: number): InsightsData {
  const key = dayKey(now);
  const prev = data.days[key];
  const domains = { ...(prev?.domains ?? {}) };
  for (const [d, c] of Object.entries(sample.domains)) domains[d] = (domains[d] ?? 0) + c;
  const groups = { ...(prev?.groups ?? {}) };
  for (const [g, c] of Object.entries(sample.groups)) groups[g] = Math.max(groups[g] ?? 0, c);
  const day: InsightsDay = {
    n: (prev?.n ?? 0) + 1,
    sum: (prev?.sum ?? 0) + sample.total,
    min: prev ? Math.min(prev.min, sample.total) : sample.total,
    max: prev ? Math.max(prev.max, sample.total) : sample.total,
    domains: topMap(domains, DOMAINS_PER_DAY),
    groups: topMap(groups, GROUPS_PER_DAY),
  };
  return {
    ...data,
    lastSampleAt: now,
    days: pruneDays({ ...data.days, [key]: day }, INSIGHTS_RETENTION_DAYS, now),
  };
}

export function shouldSample(data: InsightsData, now: number, force = false): boolean {
  if (data.paused) return false;
  return force || now - data.lastSampleAt >= SAMPLE_INTERVAL_MS || now < data.lastSampleAt;
}

/** Adds `n` to a per-day counter map and prunes keys older than `keepDays`. Pure. */
export function bumpDay(map: Record<string, number>, n: number, now: number, keepDays: number): Record<string, number> {
  const key = dayKey(now);
  return pruneDays({ ...map, [key]: (map[key] ?? 0) + n }, keepDays, now);
}

// ---------- view model ----------

export interface DayPoint {
  key: string;
  /** null when there were no samples that day. */
  min: number | null;
  avg: number | null;
  max: number | null;
  closed: number;
  discarded: number;
}

export interface InsightsSummary {
  days: DayPoint[];
  /** Average open tabs per domain on days it was seen, largest first. */
  topDomains: Array<{ domain: string; avg: number }>;
  /** Largest size each group reached in the range, largest first. */
  biggestGroups: Array<{ title: string; size: number }>;
  totals: { closed: number; discarded: number; samples: number };
}

export function summarize(
  data: InsightsData,
  cleanup: { closedByDay: Record<string, number>; discardedByDay: Record<string, number> },
  rangeDays: number,
  now: number,
  limit = 10,
): InsightsSummary {
  const keys = lastDayKeys(rangeDays, now);
  const domainSum: Record<string, number> = {};
  const domainDays: Record<string, number> = {};
  const groupMax: Record<string, number> = {};
  const totals = { closed: 0, discarded: 0, samples: 0 };
  const days = keys.map((key): DayPoint => {
    const d = data.days[key];
    const closed = cleanup.closedByDay[key] ?? 0;
    const discarded = cleanup.discardedByDay[key] ?? 0;
    totals.closed += closed;
    totals.discarded += discarded;
    if (!d || d.n <= 0) return { key, min: null, avg: null, max: null, closed, discarded };
    totals.samples += d.n;
    for (const [dom, s] of Object.entries(d.domains)) {
      domainSum[dom] = (domainSum[dom] ?? 0) + s / d.n;
      domainDays[dom] = (domainDays[dom] ?? 0) + 1;
    }
    for (const [g, s] of Object.entries(d.groups)) groupMax[g] = Math.max(groupMax[g] ?? 0, s);
    return { key, min: d.min, avg: d.sum / d.n, max: d.max, closed, discarded };
  });
  const domainAvg = Object.fromEntries(Object.entries(domainSum).map(([k, s]) => [k, s / (domainDays[k] ?? 1)]));
  return {
    days,
    topDomains: topEntries(domainAvg, limit).map(([domain, avg]) => ({ domain, avg })),
    biggestGroups: topEntries(groupMax, limit).map(([title, size]) => ({ title, size })),
    totals,
  };
}

// ---------- chart helpers ----------

/** A "nice" axis maximum >= v: 1, 2, 5 × 10^k. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * exp >= v) return m * exp;
  /* c8 ignore next */
  return 10 * exp;
}

/** x-coordinate of point i of n spread evenly over [0, width]. */
export function xAt(i: number, n: number, width: number): number {
  return n <= 1 ? width / 2 : (i / (n - 1)) * width;
}

/** SVG path through the points; null values break the line into segments. */
export function linePath(values: Array<number | null>, width: number, height: number, max: number): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const x = xAt(i, values.length, width);
    const y = height - (v / max) * height;
    d += `${pen ? 'L' : 'M'}${round(x)},${round(y)}`;
    pen = true;
  });
  return d;
}

/** Closed SVG area between `lo` and `hi` for each contiguous run of non-null points. */
export function bandPath(
  lo: Array<number | null>,
  hi: Array<number | null>,
  width: number,
  height: number,
  max: number,
): string {
  const n = lo.length;
  const y = (v: number) => round(height - (v / max) * height);
  let d = '';
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const top = run.map((i) => `${round(xAt(i, n, width))},${y(hi[i]!)}`);
    const bottom = [...run].reverse().map((i) => `${round(xAt(i, n, width))},${y(lo[i]!)}`);
    d += `M${top.join('L')}L${bottom.join('L')}Z`;
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (lo[i] === null || hi[i] === null) flush();
    else run.push(i);
  }
  flush();
  return d;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
