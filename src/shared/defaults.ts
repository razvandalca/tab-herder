import type { Settings } from './types';

export const RECENTLY_CLEANED_MAX = 100;
/** How many auto-saved "closed groups" sessions to keep for Undo / restore later. */
export const CLOSED_SESSIONS_MAX = 20;
export const STATS_RETENTION_DAYS = 90;
export const GROUPING_DEBOUNCE_MS = 750;
export const CLEANUP_ALARM = 'tab-herder:cleanup';
export const AUTOSAVE_ALARM = 'tab-herder:autosave';

export const DEFAULT_SETTINGS: Settings = {
  mode: 'manual',
  groupByDomain: true,
  mergeSubdomains: true,
  minGroupSize: 2,
  includeIncognito: false,
  contentGrouping: false,
  badge: { enabled: true, threshold: 30 },
  cleanup: {
    enabled: true,
    intervalMinutes: 15,
    inactiveHours: 12,
    inactiveAction: 'discard',
    closeDuplicates: true,
    allowlist: [],
    detectUnsavedForms: false,
  },
  // Off by default (opt-in, as the issue asks): it writes browsing history to local storage.
  autosave: { enabled: false, intervalMinutes: 10, keep: 5 },
  rules: [],
  profiles: [{ id: 'default', name: 'Default', rules: [] }],
  activeProfileId: 'default',
};

/** Generates a short random id; good enough for rules/sessions (not security-sensitive). */
export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
