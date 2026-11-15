// Samples aggregate open-tab counts for the options page Insights tab. Local only: nothing
// here leaves chrome.storage.local, and no URLs are stored (only base domains and group titles).
import {
  addSample,
  emptyInsights,
  normalizeInsights,
  shouldSample,
  takeSample,
  SAMPLE_INTERVAL_MS,
  type InsightsData,
} from '@/core/insights';
import { patchLocal } from '@/shared/storage';
import { allGroups, allTabs } from './tabs';

export const INSIGHTS_KEY = 'insights';

/** In-memory throttle so bursts of tab events don't each read storage. */
let lastAttempt = 0;
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function read(): Promise<InsightsData> {
  const raw = await chrome.storage.local.get(INSIGHTS_KEY);
  return normalizeInsights(raw[INSIGHTS_KEY]);
}

async function write(data: InsightsData): Promise<void> {
  await chrome.storage.local.set({ [INSIGHTS_KEY]: data });
}

/** Takes a sample unless one was taken in the last SAMPLE_INTERVAL_MS (or collection is paused). */
export function maybeSampleInsights(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastAttempt < SAMPLE_INTERVAL_MS && now >= lastAttempt) return Promise.resolve();
  lastAttempt = now;
  return serial(async () => {
    const data = await read();
    if (!shouldSample(data, now, force)) return;
    const [tabs, groups] = await Promise.all([allTabs(), allGroups()]);
    await write(addSample(data, takeSample(tabs, groups), now));
  }).catch((e: unknown) => console.debug('[tab-herder] insights sample failed', e));
}

export function setInsightsPaused(paused: boolean): Promise<void> {
  return serial(async () => write({ ...(await read()), paused }));
}

/** Deletes all insights samples and the per-day cleanup counters (keeps the paused flag). */
export async function clearInsights(): Promise<void> {
  await serial(async () => write(emptyInsights((await read()).paused)));
  await patchLocal((l) => {
    l.stats = { cleanedByDay: {}, discardedByDay: {} };
  });
}
