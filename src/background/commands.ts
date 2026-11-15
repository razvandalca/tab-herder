import { regroupAll } from './grouping';
import { closeDuplicatesNow } from './cleanup';
import { closeGroup, currentGroupId } from './groupActions';

export async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  switch (command) {
    case 'group-now':
      await regroupAll();
      break;
    case 'close-current-group': {
      const gid = await currentGroupId();
      if (gid !== null) await closeGroup(gid);
      break;
    }
    case 'close-duplicates':
      await closeDuplicatesNow();
      break;
    case 'open-side-panel':
      // Runs synchronously inside the command's user gesture, as sidePanel.open requires.
      await chrome.sidePanel.open({ windowId: tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT });
      break;
    // "_execute_action" opens the popup itself; the popup focuses its search box on open.
  }
}
