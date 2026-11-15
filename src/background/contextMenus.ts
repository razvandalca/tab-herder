import { regroupAll } from './grouping';
import { closeDuplicatesNow, runCleanup } from './cleanup';
import { closeAllGroups, closeGroup, moveGroupToNewWindow, saveAndCloseGroup, setCollapsedAll, ungroupAll } from './groupActions';
import { NO_GROUP } from '@/shared/types';
import type { GroupSortKey, TabSortKey } from '@/core/sorting';
import { GROUP_SORT_LABELS, TAB_SORT_LABELS } from '@/core/sorting';
import { sortGroupsInWindow, sortTabsInGroup } from './sorting';

const SORT_TABS = 'sort-tabs';
const SORT_GROUPS = 'sort-groups';

function installSortMenus(): void {
  const contexts: ['page', 'action'] = ['page', 'action'];
  chrome.contextMenus.create({ id: 'sep-sort', parentId: ROOT, type: 'separator', contexts });
  chrome.contextMenus.create({ id: SORT_TABS, parentId: ROOT, title: "Sort this tab's group", contexts });
  for (const [key, title] of Object.entries(TAB_SORT_LABELS)) {
    chrome.contextMenus.create({ id: `${SORT_TABS}:${key}`, parentId: SORT_TABS, title, contexts });
  }
  chrome.contextMenus.create({ id: SORT_GROUPS, parentId: ROOT, title: 'Sort groups in this window', contexts });
  for (const [key, title] of Object.entries(GROUP_SORT_LABELS)) {
    chrome.contextMenus.create({ id: `${SORT_GROUPS}:${key}`, parentId: SORT_GROUPS, title, contexts });
  }
}

/** Handles the sort submenu entries; returns false for any other menu id. */
async function handleSortMenu(id: string, groupId: number, windowId: number): Promise<boolean> {
  const [menu, key] = id.split(':');
  if (menu === SORT_TABS && key) {
    if (groupId !== NO_GROUP) await sortTabsInGroup(groupId, key as TabSortKey);
    return true;
  }
  if (menu === SORT_GROUPS && key) {
    await sortGroupsInWindow(windowId, key as GroupSortKey);
    return true;
  }
  return false;
}

const ROOT = 'tab-herder';
const items: Array<{ id: string; title: string }> = [
  { id: 'group-now', title: 'Group all tabs now' },
  { id: 'close-group', title: "Close this tab's group" },
  { id: 'save-close-group', title: "Save & close this tab's group" },
  { id: 'move-group', title: 'Move this group to a new window' },
  { id: 'sep-1', title: '' },
  { id: 'collapse-all', title: 'Collapse all groups' },
  { id: 'expand-all', title: 'Expand all groups' },
  { id: 'ungroup-all', title: 'Ungroup all tabs in this window' },
  { id: 'close-all-groups', title: 'Close all groups in this window' },
  { id: 'sep-2', title: '' },
  { id: 'close-duplicates', title: 'Close duplicate tabs' },
  { id: 'cleanup-now', title: 'Clean up now' },
];

export function installContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: ROOT, title: 'Tab Herder', contexts: ['page', 'action'] });
    for (const item of items) {
      if (item.id.startsWith('sep')) {
        chrome.contextMenus.create({ id: item.id, parentId: ROOT, type: 'separator', contexts: ['page', 'action'] });
      } else {
        chrome.contextMenus.create({ id: item.id, parentId: ROOT, title: item.title, contexts: ['page', 'action'] });
      }
    }
    installSortMenus();
  });
}

export async function handleContextMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const groupId = tab?.groupId ?? NO_GROUP;
  const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused()).id!;
  if (await handleSortMenu(String(info.menuItemId), groupId, windowId)) return;
  switch (info.menuItemId) {
    case 'group-now':
      await regroupAll();
      break;
    case 'close-group':
      if (groupId !== NO_GROUP) await closeGroup(groupId);
      break;
    case 'save-close-group':
      if (groupId !== NO_GROUP) await saveAndCloseGroup(groupId);
      break;
    case 'move-group':
      if (groupId !== NO_GROUP) await moveGroupToNewWindow(groupId);
      break;
    case 'collapse-all':
      await setCollapsedAll(windowId, true);
      break;
    case 'expand-all':
      await setCollapsedAll(windowId, false);
      break;
    case 'ungroup-all':
      await ungroupAll(windowId);
      break;
    case 'close-all-groups':
      await closeAllGroups(windowId);
      break;
    case 'close-duplicates':
      await closeDuplicatesNow();
      break;
    case 'cleanup-now':
      await runCleanup({ force: true });
      break;
  }
}
