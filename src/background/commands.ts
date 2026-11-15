import { regroupAll } from './grouping';
import { closeDuplicatesNow } from './cleanup';
import { closeGroup, currentGroupId } from './groupActions';

export async function handleCommand(command: string): Promise<void> {
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
    // "_execute_action" opens the popup itself; the popup focuses its search box on open.
  }
}
