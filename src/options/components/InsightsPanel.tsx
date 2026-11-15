import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  INSIGHTS_RETENTION_DAYS,
  bandPath,
  linePath,
  niceMax,
  normalizeInsights,
  summarize,
  xAt,
  type DayPoint,
  type InsightsData,
} from '@/core/insights';
import { send } from '@/shared/messages';
import type { LocalState } from '@/shared/types';
import type { PanelProps } from '../App';

const KEY = 'insights';
const RANGES = [7, 30, 90] as const;

interface Props extends PanelProps {
  local: LocalState;
}

function useInsights(): InsightsData | null {
  const [data, setData] = useState<InsightsData | null>(null);
  useEffect(() => {
    const load = () => void chrome.storage.local.get(KEY).then((r) => setData(normalizeInsights(r[KEY])));
    load();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && KEY in changes) load();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return data;
}

const fmtDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function InsightsPanel({ local, notify, fail }: Props) {
  const data = useInsights();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const summary = useMemo(
    () =>
      data &&
      summarize(
        data,
        { closedByDay: local.stats.cleanedByDay, discardedByDay: local.stats.discardedByDay ?? {} },
        range,
        Date.now(),
      ),
    [data, local.stats, range],
  );

  if (!data || !summary) return <div class="muted">Loading…</div>;

  const clear = async () => {
    if (!confirm('Delete all insights data? This cannot be undone.')) return;
    try {
      await send({ type: 'clearInsights' });
      notify('Insights data cleared');
    } catch (e) {
      fail(e);
    }
  };
  const togglePaused = (paused: boolean) =>
    send({ type: 'setInsightsPaused', paused })
      .then(() => notify(paused ? 'Collection paused' : 'Collection resumed'))
      .catch(fail);

  const empty = summary.totals.samples === 0;

  return (
    <section class="insights">
      <div class="card">
        <div class="row between">
          <h2>Insights</h2>
          <div class="row" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                type="button"
                key={r}
                class={`btn sm${range === r ? ' primary' : ''}`}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>
        <div class="hint">
          Stored only on this device, in <code>chrome.storage.local</code>: daily open-tab counts, base domain names
          with average tab counts, group titles with their largest size, and how many tabs cleanup closed or discarded.
          No URLs, page titles or browsing history. Kept for {INSIGHTS_RETENTION_DAYS} days, never sent anywhere.
        </div>
        <div class="row between">
          <label class="check">
            <input
              type="checkbox"
              checked={!data.paused}
              onChange={(e) => void togglePaused(!(e.target as HTMLInputElement).checked)}
            />
            <span class="title">Collect insights</span>
          </label>
          <button type="button" class="btn sm danger" onClick={() => void clear()}>
            Clear insights data
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Open tabs</h2>
        {empty ? (
          <div class="muted">
            {data.paused
              ? 'Collection is paused.'
              : 'No samples yet. Tab Herder records the open-tab count at most every 10 minutes while Chrome is running.'}
          </div>
        ) : (
          <TabsChart days={summary.days} />
        )}
      </div>

      <div class="card">
        <div class="row between">
          <h2>Cleanup</h2>
          <div class="row small muted">
            <span class="legend">
              <i style="background: var(--chart-1)" />
              Closed {summary.totals.closed}
            </span>
            <span class="legend">
              <i style="background: var(--chart-2)" />
              Discarded {summary.totals.discarded}
            </span>
          </div>
        </div>
        <CleanupChart days={summary.days} />
      </div>

      <div class="grid2">
        <div class="card">
          <h2>Top domains</h2>
          <div class="hint">Average open tabs on days the domain was open.</div>
          <HBars rows={summary.topDomains.map((d) => [d.domain, d.avg])} empty="No domains recorded yet." />
        </div>
        <div class="card">
          <h2>Biggest groups</h2>
          <div class="hint">Most tabs a group held at once.</div>
          <HBars rows={summary.biggestGroups.map((g) => [g.title, g.size])} empty="No groups recorded yet." />
        </div>
      </div>
    </section>
  );
}

// ---------- charts (plain SVG) ----------

const W = 640;
const H = 150;
const PAD = { l: 34, r: 8, t: 8, b: 22 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

function Axes({ max, days }: { max: number; days: DayPoint[] }) {
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <g class="axis">
      {[0, max / 2, max].map((v) => {
        const y = PAD.t + IH - (v / max) * IH;
        return (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} />
            <text x={PAD.l - 6} y={y + 4} text-anchor="end">
              {fmt(v)}
            </text>
          </g>
        );
      })}
      {first && (
        <text x={PAD.l} y={H - 6}>
          {fmtDay(first.key)}
        </text>
      )}
      {last && (
        <text x={W - PAD.r} y={H - 6} text-anchor="end">
          {fmtDay(last.key)}
        </text>
      )}
    </g>
  );
}

function TabsChart({ days }: { days: DayPoint[] }) {
  const max = niceMax(Math.max(...days.map((d) => d.max ?? 0)));
  const n = days.length;
  const avg = days.map((d) => d.avg);
  const step = IW / Math.max(1, n - 1);
  return (
    <figure class="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Open tabs per day: average line with daily minimum to maximum band"
      >
        <Axes max={max} days={days} />
        <g transform={`translate(${PAD.l},${PAD.t})`}>
          <path
            class="band"
            d={bandPath(
              days.map((d) => d.min),
              days.map((d) => d.max),
              IW,
              IH,
              max,
            )}
          />
          <path class="line" d={linePath(avg, IW, IH, max)} />
          {days.map((d, i) =>
            d.avg === null ? null : (
              <g key={d.key} class="hit">
                <rect x={xAt(i, n, IW) - step / 2} y={0} width={Math.max(step, 8)} height={IH} />
                <circle
                  class={avg[i - 1] == null && avg[i + 1] == null ? 'solo' : undefined}
                  cx={xAt(i, n, IW)}
                  cy={IH - (d.avg / max) * IH}
                  r={n > 31 ? 2.5 : 3.5}
                />
                <title>{`${fmtDay(d.key)}: avg ${fmt(d.avg)}, min ${d.min}, max ${d.max}`}</title>
              </g>
            ),
          )}
        </g>
      </svg>
      <figcaption class="small muted">Line: daily average · band: daily min–max. Hover a day for values.</figcaption>
    </figure>
  );
}

function CleanupChart({ days }: { days: DayPoint[] }) {
  const max = niceMax(Math.max(...days.map((d) => d.closed + d.discarded)));
  const n = days.length;
  const slot = IW / n;
  const bw = Math.max(1, slot - 2);
  const y = (v: number) => (v / max) * IH;
  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tabs closed and discarded by cleanup per day">
        <Axes max={max} days={days} />
        <g transform={`translate(${PAD.l},${PAD.t})`}>
          {days.map((d, i) => {
            const x = i * slot + 1;
            const hc = y(d.closed);
            const hd = y(d.discarded);
            const gap = hc > 0 && hd > 0 ? 2 : 0;
            return (
              <g key={d.key} class="hit">
                <rect class="ghost" x={i * slot} y={0} width={slot} height={IH} />
                {hc > 0 && (
                  <rect
                    x={x}
                    y={IH - hc}
                    width={bw}
                    height={hc}
                    rx={Math.min(2, bw / 2)}
                    style="fill: var(--chart-1)"
                  />
                )}
                {hd > 0 && (
                  <rect
                    x={x}
                    y={IH - hc - gap - hd}
                    width={bw}
                    height={hd}
                    rx={Math.min(2, bw / 2)}
                    style="fill: var(--chart-2)"
                  />
                )}
                <title>{`${fmtDay(d.key)}: ${d.closed} closed, ${d.discarded} discarded`}</title>
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}

function HBars({ rows, empty }: { rows: Array<[string, number]>; empty: string }) {
  if (!rows.length) return <div class="muted">{empty}</div>;
  const max = Math.max(...rows.map(([, v]) => v));
  const rowH = 22;
  const labelW = 130;
  const valueW = 36;
  const width = 360;
  const barW = width - labelW - valueW;
  return (
    <svg
      class="hbars"
      viewBox={`0 0 ${width} ${rows.length * rowH}`}
      role="img"
      aria-label={rows.map(([l, v]) => `${l}: ${fmt(v)}`).join(', ')}
    >
      {rows.map(([label, v], i) => (
        <g key={label} transform={`translate(0,${i * rowH})`}>
          <title>{`${label}: ${fmt(v)}`}</title>
          <text x={0} y={15} class="label">
            {label.length > 20 ? `${label.slice(0, 19)}…` : label}
          </text>
          <rect
            x={labelW}
            y={5}
            width={Math.max(2, (v / max) * barW)}
            height={12}
            rx={2}
            style="fill: var(--chart-1)"
          />
          <text x={width} y={15} text-anchor="end" class="value">
            {fmt(v)}
          </text>
        </g>
      ))}
    </svg>
  );
}
