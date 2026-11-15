// Scheduled snapshots of every window, restorable from the Sessions panel (issue #5).
import { buildAutosaveWindows, clampKeep, fingerprint, pruneAutosaves, shouldAutosave } from '@/core/autosave';
import { AUTOSAVE_ALARM, newId } from '@/shared/defaults';
import { getLocal, getSettings, patchLocal } from '@/shared/storage';
import type { Autosave, Settings } from '@/shared/types';
import { allGroups, allTabs } from './tabs';
import { openSession } from './sessions';

export async function ensureAutosaveAlarm(settings?: Settings): Promise<void> {
  const s = settings ?? (await getSettings());
  const existing = await chrome.alarms.get(AUTOSAVE_ALARM);
  if (!s.autosave.enabled) {
    if (existing) await chrome.alarms.clear(AUTOSAVE_ALARM);
    return;
  }
  const period = Math.max(1, s.autosave.intervalMinutes);
  if (!existing || existing.periodInMinutes !== period) {
    await chrome.alarms.create(AUTOSAVE_ALARM, { periodInMinutes: period, delayInMinutes: period });
  }
}

/**
 * Snapshots all windows unless nothing changed since the newest autosave.
 * Returns the new autosave, or null when skipped.
 */
export async function runAutosave(opts: { force?: boolean } = {}): Promise<Autosave | null> {
  const settings = await getSettings();
  if (!settings.autosave.enabled && !opts.force) return null;
  const [tabs, groups] = await Promise.all([allTabs(), allGroups()]);
  const windows = buildAutosaveWindows(tabs, groups);
  // Cheap check first so an unchanged browser costs no storage write at all.
  if (!shouldAutosave(windows, (await getLocal()).autosaves)) return null;
  let created: Autosave | null = null;
  await patchLocal((l) => {
    // Decide inside the queued write so two overlapping runs cannot both append.
    if (shouldAutosave(windows, l.autosaves)) {
      created = { id: newId(), createdAt: Date.now(), fingerprint: fingerprint(windows), windows };
      l.autosaves = [created, ...l.autosaves];
    }
    l.autosaves = pruneAutosaves(l.autosaves, settings.autosave.keep);
  });
  return created;
}

/** Re-applies the retention limit, e.g. after the user lowers "keep". */
export async function pruneStoredAutosaves(settings: Settings): Promise<void> {
  const local = await getLocal();
  if (local.autosaves.length <= clampKeep(settings.autosave.keep)) return;
  await patchLocal((l) => {
    l.autosaves = pruneAutosaves(l.autosaves, settings.autosave.keep);
  });
}

/** Opens each snapshotted window in a new window, with its groups recreated. */
export async function restoreAutosave(id: string): Promise<void> {
  const local = await getLocal();
  const a = local.autosaves.find((x) => x.id === id);
  if (!a) throw new Error('Autosave not found');
  for (const w of a.windows) {
    await openSession({ id: a.id, name: '', createdAt: a.createdAt, kind: 'window', ...w });
  }
}

export async function deleteAutosave(id: string): Promise<void> {
  await patchLocal((l) => {
    l.autosaves = l.autosaves.filter((a) => a.id !== id);
  });
}
