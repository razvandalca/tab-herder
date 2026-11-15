import type { Request, Response, Stats } from '@/shared/messages';
import { getLocal, cleanedInLastDays, updateSettings } from '@/shared/storage';
import type { ExportFile, Rule, Settings } from '@/shared/types';
import { regroupAll, regroupWindow } from './grouping';
import { clearCleaned, closeDuplicatesNow, restoreCleaned, runCleanup } from './cleanup';
import { deleteSession, renameSession, restoreSession, saveGroupSession, saveWindowSession } from './sessions';
import {
  closeAllGroups, closeGroup, moveGroupToNewWindow, recolorGroup, renameGroup, saveAndCloseGroup, setCollapsed,
  setCollapsedAll, ungroup, ungroupAll,
} from './groupActions';
import { registerContentScript, unregisterContentScript } from './contentScripts';
import { clearInsights, setInsightsPaused } from './insights';
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
    case 'setContentScript':
      return req.enabled ? registerContentScript() : unregisterContentScript();
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

function isRule(r: unknown): r is Rule {
  if (typeof r !== 'object' || r === null) return false;
  const x = r as Record<string, unknown>;
  return typeof x.name === 'string' && typeof x.pattern === 'string' && typeof x.matchType === 'string';
}

export async function importData(data: ExportFile, rulesMode: 'replace' | 'append'): Promise<{ rules: number; sessions: number }> {
  if (!data || data.version !== 1) throw new Error('Unsupported file format');
  let rulesCount = 0;
  if (data.settings) {
    const incoming = withDefaults<Settings>(data.settings, DEFAULT_SETTINGS);
    const rules = (Array.isArray(data.settings.rules) ? data.settings.rules : []).filter(isRule).map((r) => ({
      ...r,
      id: r.id || newId(),
      enabled: r.enabled !== false,
      color: r.color ?? 'auto',
    }));
    rulesCount = rules.length;
    await updateSettings((current) => {
      const { rules: _ignored, ...rest } = incoming;
      const existingIds = new Set(current.rules.map((r) => r.id));
      const merged = rulesMode === 'replace' ? rules : [...current.rules, ...rules.filter((r) => !existingIds.has(r.id))];
      return { ...current, ...rest, rules: merged };
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
