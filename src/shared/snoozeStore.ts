import type { SnoozedItem } from '@/core/snooze';

/*
 * Snoozed tabs/groups live under their own chrome.storage.local key ("snoozed") rather than in
 * LocalState, so they survive restarts and can be watched independently by the popup.
 */
export const SNOOZE_KEY = 'snoozed';
export const SNOOZE_ALARM = 'tab-herder:snooze';

export async function getSnoozed(): Promise<SnoozedItem[]> {
  const raw = await chrome.storage.local.get(SNOOZE_KEY);
  const list = raw[SNOOZE_KEY];
  return Array.isArray(list) ? (list as SnoozedItem[]) : [];
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialised read-modify-write; `fn` returns the new list. */
export function patchSnoozed(fn: (items: SnoozedItem[]) => SnoozedItem[]): Promise<SnoozedItem[]> {
  const run = async () => {
    const next = fn(await getSnoozed());
    await chrome.storage.local.set({ [SNOOZE_KEY]: next });
    return next;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export function onSnoozedChanged(cb: (items: SnoozedItem[]) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && SNOOZE_KEY in changes) void getSnoozed().then(cb);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
