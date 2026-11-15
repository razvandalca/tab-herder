import type { CleanedEntry } from '@/shared/types';
import { send } from '@/shared/messages';
import { Favicon } from '@/ui/Favicon';
import { Icons } from '@/ui/icons';
import type { Runner } from '../App';

const reasonLabel: Record<CleanedEntry['reason'], string> = {
  duplicate: 'duplicate',
  inactive: 'inactive',
  groupAutoClose: 'group auto-close',
};

export function RecentlyCleaned({ entries, run }: { entries: CleanedEntry[]; run: Runner }) {
  if (!entries.length) return null;
  const shown = entries.slice(0, 8);
  return (
    <details>
      <summary class="section-head">
        <h3>Recently cleaned</h3>
        <span class="badge">{entries.length}</span>
      </summary>
      <div class="list" role="list">
        {shown.map((e) => (
          <div class="item" role="listitem" title={e.url}>
            <Favicon src={e.favIconUrl} />
            <div class="grow">
              <div class="ellipsis">{e.title}</div>
              <div class="small muted ellipsis">{reasonLabel[e.reason]}{e.groupTitle ? ` · ${e.groupTitle}` : ''}</div>
            </div>
            <button class="btn sm" onClick={() => run('Restored', () => send({ type: 'restoreCleaned', id: e.id }))}><Icons.restore /> Restore</button>
          </div>
        ))}
        {entries.length > shown.length && (
          <button class="btn sm" style="align-self: flex-start; margin: 4px 8px" onClick={() => chrome.runtime.openOptionsPage()}>
            Show all {entries.length} in settings
          </button>
        )}
      </div>
    </details>
  );
}
