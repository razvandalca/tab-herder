import type { Request, Response, Stats } from '@/shared/messages';
import { getLocal, cleanedInLastDays, updateSettings } from '@/shared/storage';
import type { ExportFile, Settings } from '@/shared/types';
import { mergeImportedSettings, switchProfile } from '@/core/profiles';
import { regroupAll, regroupWindow } from './grouping';
import { clearCleaned, closeDuplicatesNow, restoreCleaned, runCleanup } from './cleanup';
import { deleteSession, renameSession, restoreSession, saveGroupSession, saveWindowSession, undoClose } from './sessions';
import {
  closeAllGroups, closeGroup, moveGroupToNewWindow, recolorGroup, renameGroup, saveAndCloseGroup, setCollapsed,
  setCollapsedAll, ungroup, ungroupAll,
} from './groupActions';
import { registerContentScript, unregisterContentScript } from './contentScripts';
import { cancelSnoozed, snoozeGroup, snoozeTab, wakeSnoozed } from './snooze';
import { clearInsights, setInsightsPaused } from './insights';
import { deleteAutosave, restoreAutosave, runAutosave } from './autosave';
import { sortGroupsInWindow, sortTabsInGroup } from './sorting';
import { patchLocal } from '@/shared/storage';
import { withDefaults } from '@/shared/storage';
import { DEFAULT_SETTINGS, newId } from '@/shared/defaults';

export async function handleRequest(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'groupNow':
      return req.windowId === undefined ? regroupAll() : regroupWindow(req.windowId);
    case 'cleanupNow':
      return runCleanup({ force: true });
    case 'closeDuplicates':
      return closeDuplicatesNow();
    case 'getStats':
      return getStats();
    case 'saveSession':
      return req.kind === 'window' ? saveWindowSession(req.windowId, req.name) : saveGroupSession(req.groupId, req.name);
    case 'restoreSession':
      return restoreSession(req.id);
    case 'deleteSession':
      return deleteSession(req.id);
    case 'renameSession':
      return renameSession(req.id, req.name);
    case 'autosaveNow':
      return runAutosave({ force: true });
    case 'restoreAutosave':
      return restoreAutosave(req.id);
    case 'deleteAutosave':
      return deleteAutosave(req.id);
    case 'closeGroup':
      return closeGroup(req.groupId);
    case 'saveAndCloseGroup':
      return saveAndCloseGroup(req.groupId, req.name);
    case 'ungroup':
      return ungroup(req.groupId);
    case 'renameGroup':
      return renameGroup(req.groupId, req.title);
    case 'recolorGroup':
      return recolorGroup(req.groupId, req.color);
    case 'setCollapsed':
      return setCollapsed(req.groupId, req.collapsed);
    case 'collapseAll':
      return setCollapsedAll(req.windowId, req.collapsed);
    case 'ungroupAll':
      return ungroupAll(req.windowId);
    case 'closeAllGroups':
      return closeAllGroups(req.windowId);
    case 'moveGroupToNewWindow':
      return moveGroupToNewWindow(req.groupId);
    case 'restoreCleaned':
      return restoreCleaned(req.id);
    case 'clearCleaned':
      return clearCleaned();
    case 'importData':
      return importData(req.data, req.rulesMode);
    case 'switchProfile':
      return updateSettings((s) => switchProfile(s, req.id)).then((s) => s.activeProfileId === req.id);
    case 'setContentScript':
      return req.enabled ? registerContentScript() : unregisterContentScript();
    case 'snoozeTab':
      return snoozeTab(req.tabId, req.wakeAt);
    case 'snoozeGroup':
      return snoozeGroup(req.groupId, req.wakeAt);
    case 'wakeSnoozed':
      return wakeSnoozed(req.id);
    case 'cancelSnoozed':
      return cancelSnoozed(req.id);
    case 'sortGroupTabs':
      return sortTabsInGroup(req.groupId, req.key);
    case 'sortGroups':
      return sortGroupsInWindow(req.windowId, req.key);
    case 'undoClose':
      return undoClose(req.ids);
    case 'clearInsights':
      return clearInsights();
    case 'setInsightsPaused':
      return setInsightsPaused(req.paused);
    default:
      throw new Error(`Unknown request: ${(req as { type: string }).type}`);
  }
}

async function getStats(): Promise<Stats> {
  const [tabs, groups, local] = await Promise.all([chrome.tabs.query({}), chrome.tabGroups.query({}), getLocal()]);
  return { openTabs: tabs.length, groups: groups.length, cleanedThisWeek: cleanedInLastDays(local.stats.cleanedByDay, 7) };
}

export async function importData(data: ExportFile, rulesMode: 'replace' | 'append'): Promise<{ rules: number; sessions: number }> {
  if (!data || (data.version !== 1 && data.version !== 2)) throw new Error('Unsupported file format');
  let rulesCount = 0;
  if (data.settings) {
    const file = { version: data.version, settings: data.settings as unknown as Record<string, unknown> };
    const incoming = withDefaults<Settings>(data.settings, DEFAULT_SETTINGS);
    await updateSettings((current) => {
      const r = mergeImportedSettings(current, incoming, file, rulesMode, newId);
      rulesCount = r.rules;
      return r.settings;
    });
  }
  let sessionsCount = 0;
  if (Array.isArray(data.sessions)) {
    const sessions = data.sessions.filter((s) => s && Array.isArray(s.groups) && typeof s.name === 'string');
    sessionsCount = sessions.length;
    await patchLocal((l) => {
      const ids = new Set(l.sessions.map((s) => s.id));
      l.sessions = [...sessions.filter((s) => !ids.has(s.id)).map((s) => ({ ...s, ungrouped: s.ungrouped ?? [] })), ...l.sessions];
    });
  }
  return { rules: rulesCount, sessions: sessionsCount };
}

export function installMessageRouter(): void {
  chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse: (r: Response) => void) => {
    if (!msg || typeof msg !== 'object' || !('type' in msg) || (msg as { type: string }).type.startsWith('th:')) return false;
    handleRequest(msg)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true; // keep the channel open for the async response
  });
}
