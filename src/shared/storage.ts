import type { LocalState, SessionState, Settings } from './types';
import { DEFAULT_SETTINGS } from './defaults';
import { CHUNK_PREFIX, decodeProfiles, encodeSync } from '@/core/profiles';

/*
 * Layout
 *   chrome.storage.sync:    { settings: Settings-without-rules, rules: Rule[] (active profile),
 *                             profiles: index, "rules:<id>:<n>": chunks of inactive profiles }
 *     (rules live under their own keys so long rule lists do not hit the 8 KB per-item quota;
 *      see src/core/profiles.ts)
 *   chrome.storage.local:   { sessions, autosaves, recentlyCleaned, stats, insights }
 *   chrome.storage.session: { managedGroups, overrides, pendingMoves, lastActive, groupLastActive }
 */

export const DEFAULT_LOCAL: LocalState = {
  sessions: [],
  autosaves: [],
  recentlyCleaned: [],
  stats: { cleanedByDay: {}, discardedByDay: {} },
};
export const DEFAULT_SESSION: SessionState = {
  managedGroups: {},
  overrides: {},
  pendingMoves: {},
  lastActive: {},
  groupLastActive: {},
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fills missing keys from defaults (one level of nesting for plain objects). */
export function withDefaults<T extends object>(value: unknown, defaults: T): T {
  if (!isObject(value)) return structuredClone(defaults);
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, dv] of Object.entries(defaults)) {
    const v = value[k];
    if (v === undefined) out[k] = structuredClone(dv);
    else if (isObject(dv) && isObject(v)) out[k] = { ...dv, ...v };
    else out[k] = v;
  }
  return out as T;
}

// ---------- settings (sync) ----------

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(null);
  const settings = withDefaults<Settings>(raw.settings, DEFAULT_SETTINGS);
  return { ...settings, ...decodeProfiles(raw) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const raw = await chrome.storage.sync.get(null);
  const { items, remove } = encodeSync(settings, Object.keys(raw));
  // Only write what changed, to stay well inside the sync write-rate quotas.
  const changed = Object.fromEntries(
    Object.entries(items).filter(([k, v]) => JSON.stringify(raw[k]) !== JSON.stringify(v)),
  );
  if (Object.keys(changed).length) await chrome.storage.sync.set(changed);
  if (remove.length) await chrome.storage.sync.remove(remove);
}

export async function updateSettings(patch: (s: Settings) => Settings | void): Promise<Settings> {
  const current = await getSettings();
  const next = patch(current) ?? current;
  await saveSettings(next);
  return next;
}

export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync') return;
    const keys = Object.keys(changes);
    if (keys.some((k) => k === 'settings' || k === 'rules' || k === 'profiles' || k.startsWith(CHUNK_PREFIX))) {
      void getSettings().then(cb);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---------- local ----------

export async function getLocal(): Promise<LocalState> {
  const raw = await chrome.storage.local.get(Object.keys(DEFAULT_LOCAL));
  return withDefaults<LocalState>(raw, DEFAULT_LOCAL);
}

export async function setLocal(patch: Partial<LocalState>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export function onLocalChanged(cb: (state: LocalState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some((k) => k in DEFAULT_LOCAL)) void getLocal().then(cb);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---------- session (ephemeral) ----------

export async function getSessionState(): Promise<SessionState> {
  const raw = await chrome.storage.session.get(Object.keys(DEFAULT_SESSION));
  return withDefaults<SessionState>(raw, DEFAULT_SESSION);
}

/**
 * Serialised read-modify-write. The service worker handles events concurrently, so updates
 * to the small bookkeeping maps are queued to avoid lost writes within one worker lifetime.
 */
let sessionQueue: Promise<unknown> = Promise.resolve();
export function patchSessionState(fn: (s: SessionState) => void): Promise<SessionState> {
  const run = async () => {
    const state = await getSessionState();
    fn(state);
    await chrome.storage.session.set(state);
    return state;
  };
  const next = sessionQueue.then(run, run);
  sessionQueue = next.catch(() => undefined);
  return next;
}

let localQueue: Promise<unknown> = Promise.resolve();
export function patchLocal(fn: (s: LocalState) => void): Promise<LocalState> {
  const run = async () => {
    const state = await getLocal();
    fn(state);
    await chrome.storage.local.set(state);
    return state;
  };
  const next = localQueue.then(run, run);
  localQueue = next.catch(() => undefined);
  return next;
}

// ---------- helpers ----------

export function todayKey(now = Date.now()): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function cleanedInLastDays(cleanedByDay: Record<string, number>, days: number, now = Date.now()): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    total += cleanedByDay[todayKey(now - i * 86_400_000)] ?? 0;
  }
  return total;
}
