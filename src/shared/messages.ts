import type { ExportFile, GroupColor } from './types';
import type { GroupSortKey, TabSortKey } from '@/core/sorting';

export type Request =
  | { type: 'groupNow'; windowId?: number }
  | { type: 'cleanupNow' }
  | { type: 'closeDuplicates' }
  | { type: 'getStats' }
  | { type: 'saveSession'; kind: 'window'; windowId: number; name: string }
  | { type: 'saveSession'; kind: 'group'; groupId: number; name: string }
  | { type: 'restoreSession'; id: string }
  | { type: 'deleteSession'; id: string }
  | { type: 'renameSession'; id: string; name: string }
  | { type: 'autosaveNow' }
  | { type: 'restoreAutosave'; id: string }
  | { type: 'deleteAutosave'; id: string }
  | { type: 'closeGroup'; groupId: number }
  | { type: 'saveAndCloseGroup'; groupId: number; name?: string }
  | { type: 'ungroup'; groupId: number }
  | { type: 'renameGroup'; groupId: number; title: string }
  | { type: 'recolorGroup'; groupId: number; color: GroupColor }
  | { type: 'setCollapsed'; groupId: number; collapsed: boolean }
  | { type: 'collapseAll'; windowId: number; collapsed: boolean }
  | { type: 'ungroupAll'; windowId: number }
  | { type: 'closeAllGroups'; windowId?: number }
  | { type: 'moveGroupToNewWindow'; groupId: number }
  | { type: 'restoreCleaned'; id: string }
  | { type: 'clearCleaned' }
  | { type: 'importData'; data: ExportFile; rulesMode: 'replace' | 'append' }
  | { type: 'setContentScript'; enabled: boolean }
  | { type: 'sortGroupTabs'; groupId: number; key: TabSortKey }
  | { type: 'sortGroups'; windowId: number; key: GroupSortKey }
  | { type: 'undoClose'; ids: string[] }
  | { type: 'clearInsights' }
  | { type: 'setInsightsPaused'; paused: boolean };

/** Result of closeGroup / closeAllGroups: how many were closed, and auto-saved session ids for Undo. */
export interface CloseResult {
  closed: number;
  undo: string[];
}

export interface Stats {
  openTabs: number;
  groups: number;
  cleanedThisWeek: number;
}

export type Response<T = unknown> = { ok: true; result: T } | { ok: false; error: string };

/** Typed helper for popup/options -> service worker calls. */
export async function send<T = unknown>(req: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<T> | undefined;
  if (!res) throw new Error('No response from service worker');
  if (!res.ok) throw new Error(res.error);
  return res.result;
}

/** Messages the service worker sends to the optional content script. */
export type ContentRequest = { type: 'th:probe' };
export interface ContentResponse {
  dirty: boolean;
  description: string;
}
