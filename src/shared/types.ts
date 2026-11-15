/** Native Chrome tab-group colours. */
export type GroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export type MatchType = 'domain' | 'glob' | 'regex' | 'title';

export interface Rule {
  id: string;
  /** Group title assigned when this rule matches. */
  name: string;
  color: GroupColor | 'auto';
  matchType: MatchType;
  /**
   * domain: "github.com" (matches the domain and all its subdomains)
   * glob:   "*://*.github.com/*" (Chrome match-pattern style; scheme optional)
   * regex:  tested against the full URL, case-insensitive
   * title:  comma-separated keywords, any of which may appear in the title (case-insensitive)
   */
  pattern: string;
  enabled: boolean;
  /** Close the whole group after this many minutes of inactivity (0/undefined = off). */
  autoCloseMinutes?: number;
  /** Id of the preset this rule came from, if any. */
  presetId?: string;
}

export type GroupingMode = 'off' | 'manual' | 'auto';
export type InactiveAction = 'discard' | 'close';

export interface CleanupSettings {
  enabled: boolean;
  intervalMinutes: number;
  inactiveHours: number;
  inactiveAction: InactiveAction;
  closeDuplicates: boolean;
  allowlist: string[];
  detectUnsavedForms: boolean;
}

export interface Settings {
  mode: GroupingMode;
  groupByDomain: boolean;
  mergeSubdomains: boolean;
  minGroupSize: number;
  includeIncognito: boolean;
  contentGrouping: boolean;
  badge: { enabled: boolean; threshold: number };
  cleanup: CleanupSettings;
  autosave: AutosaveSettings;
  /** Rules of the active profile (the ones grouping uses). */
  rules: Rule[];
  /** All rule profiles. The active entry's `rules` is kept in step with `rules` above. */
  profiles: RuleProfile[];
  activeProfileId: string;
}

/** A named rule set (e.g. Work / Personal); only the active one is used for grouping. */
export interface RuleProfile {
  id: string;
  name: string;
  rules: Rule[];
}

export interface AutosaveSettings {
  enabled: boolean;
  intervalMinutes: number;
  /** How many autosaves to keep (oldest are pruned). */
  keep: number;
}

export interface SavedTab {
  url: string;
  title: string;
  pinned: boolean;
  favIconUrl?: string;
}

export interface SavedGroup {
  title: string;
  color: GroupColor;
  collapsed: boolean;
  tabs: SavedTab[];
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  kind: 'window' | 'group';
  groups: SavedGroup[];
  ungrouped: SavedTab[];
  /** Saved automatically when Tab Herder closed these groups (capped, oldest dropped first). */
  autoSaved?: boolean;
  /** Window the groups were closed from; Undo restores into it while it is still open. */
  windowId?: number;
}

/** One window's contents, in the same shape sessions use. */
export type WindowSnapshot = Pick<Session, 'groups' | 'ungrouped'>;

/** Scheduled snapshot of every window; stored apart from user-saved sessions. */
export interface Autosave {
  id: string;
  createdAt: number;
  /** Hash of the restorable shape, used to skip saving when nothing changed. */
  fingerprint: string;
  windows: WindowSnapshot[];
}

export type CleanReason = 'duplicate' | 'inactive' | 'groupAutoClose';

export interface CleanedEntry {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
  groupTitle?: string;
  groupColor?: GroupColor;
  closedAt: number;
  reason: CleanReason;
}

export interface Stats {
  /** YYYY-MM-DD -> number of tabs closed that day. */
  cleanedByDay: Record<string, number>;
  /** YYYY-MM-DD -> number of tabs discarded by cleanup that day. */
  discardedByDay: Record<string, number>;
}

/** chrome.storage.local */
export interface LocalState {
  sessions: Session[];
  autosaves: Autosave[];
  recentlyCleaned: CleanedEntry[];
  stats: Stats;
}

/** chrome.storage.session — ephemeral, cleared when the browser restarts. */
export interface SessionState {
  managedGroups: Record<number, { key: string; createdAt: number }>;
  overrides: Record<number, number>;
  pendingMoves: Record<number, number>;
  lastActive: Record<number, number>;
  groupLastActive: Record<number, number>;
}

/** Version 1 files carry `settings.rules` only; version 2 adds `settings.profiles`. */
export interface ExportFile {
  version: 1 | 2;
  exportedAt: number;
  settings?: Settings;
  sessions?: Session[];
}

/** Pure, chrome-free view of a tab used by the core modules. */
export interface TabSnapshot {
  id: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  discarded: boolean;
  incognito: boolean;
  /** -1 when the tab is not in a group. */
  groupId: number;
  lastAccessed?: number;
  favIconUrl?: string;
}

export interface GroupSnapshot {
  id: number;
  windowId: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

export interface Assignment {
  name: string;
  color: GroupColor;
  ruleId?: string;
  source: 'rule' | 'domain' | 'content';
}

export type GroupAction =
  | { type: 'create'; windowId: number; title: string; color: GroupColor; tabIds: number[] }
  | { type: 'join'; groupId: number; tabIds: number[] }
  | { type: 'ungroup'; tabIds: number[] };

export const NO_GROUP = -1;
