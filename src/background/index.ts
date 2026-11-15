// Service worker entry. Keep it stateless: every handler reads what it needs from storage,
// because MV3 workers are stopped and restarted at any time.
import { getSettings, onSettingsChanged } from '@/shared/storage';
import { NO_GROUP } from '@/shared/types';
import { scheduleRegroup } from './grouping';
import { ensureCleanupAlarm, runCleanup } from './cleanup';
import { AUTOSAVE_ALARM, CLEANUP_ALARM } from '@/shared/defaults';
import { ensureAutosaveAlarm, pruneStoredAutosaves, runAutosave } from './autosave';
import { installContextMenus, handleContextMenu } from './contextMenus';
import { handleCommand } from './commands';
import { installMessageRouter } from './messages';
import { scheduleBadgeUpdate } from './badge';
import { forgetGroup, forgetTab, handleGroupChange, touchGroup, touchTab } from './overrides';
import { registerContentScript } from './contentScripts';

const log = (...a: unknown[]) => console.debug('[tab-herder]', ...a);

async function startup(): Promise<void> {
  const settings = await getSettings();
  await ensureCleanupAlarm(settings);
  await ensureAutosaveAlarm(settings);
  scheduleBadgeUpdate();
  if (settings.cleanup.detectUnsavedForms || settings.contentGrouping) await registerContentScript();
}

chrome.runtime.onInstalled.addListener((details) => {
  log('installed', details.reason);
  installContextMenus();
  void startup();
});
chrome.runtime.onStartup.addListener(() => {
  log('startup');
  void startup();
});

// ---- tab events --------------------------------------------------------------
chrome.tabs.onCreated.addListener((tab) => {
  scheduleBadgeUpdate();
  if (tab.windowId !== undefined) void maybeAutoGroup(tab.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.groupId !== undefined) void handleGroupChange(tabId);
  if ((changeInfo.url || changeInfo.status === 'complete') && tab.windowId !== undefined) {
    void maybeAutoGroup(tab.windowId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  scheduleBadgeUpdate();
  void forgetTab(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void chrome.tabs
    .get(tabId)
    .then((t) => touchTab(tabId, t.groupId ?? NO_GROUP))
    .catch(() => touchTab(tabId, NO_GROUP));
  void windowId;
});

chrome.tabs.onAttached.addListener((tabId, { newWindowId }) => {
  scheduleBadgeUpdate();
  void tabId;
  void maybeAutoGroup(newWindowId);
});
chrome.tabs.onDetached.addListener(() => scheduleBadgeUpdate());
chrome.windows.onRemoved.addListener(() => scheduleBadgeUpdate());

// ---- group events ------------------------------------------------------------
chrome.tabGroups.onRemoved.addListener((g) => void forgetGroup(g.id));
chrome.tabGroups.onUpdated.addListener((g) => {
  if (!g.collapsed) void touchGroup(g.id);
});

// ---- alarms / commands / menus / messages -----------------------------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEANUP_ALARM) {
    void runCleanup().then((r) => log('cleanup', r));
  }
  if (alarm.name === AUTOSAVE_ALARM) {
    void runAutosave().then((a) => log('autosave', a ? a.id : 'unchanged'));
  }
});
chrome.commands.onCommand.addListener((command) => void handleCommand(command));
chrome.contextMenus.onClicked.addListener((info, tab) => void handleContextMenu(info, tab));
installMessageRouter();

onSettingsChanged((settings) => {
  void ensureCleanupAlarm(settings);
  void ensureAutosaveAlarm(settings);
  void pruneStoredAutosaves(settings);
  scheduleBadgeUpdate();
});

async function maybeAutoGroup(windowId: number): Promise<void> {
  const settings = await getSettings();
  if (settings.mode !== 'auto') return;
  scheduleRegroup(windowId);
}
