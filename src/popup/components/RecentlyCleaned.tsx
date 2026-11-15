import type { CleanedEntry, Session } from '@/shared/types';
import { COLOR_HEX } from '@/core/colors';
import { send } from '@/shared/messages';
import { Favicon } from '@/ui/Favicon';
import { Icons } from '@/ui/icons';
import type { Runner } from '../App';

const reasonLabel: Record<CleanedEntry['reason'], string> = {
  duplicate: 'duplicate',
  inactive: 'inactive',
  groupAutoClose: 'group auto-close',
};

export function RecentlyCleaned({
  entries,
  closed = [],
  run,
}: {
  entries: CleanedEntry[];
  closed?: Session[];
  run: Runner;
}) {
  if (!entries.length && !closed.length) return null;
  const shown = entries.slice(0, 8);
  const shownClosed = closed.slice(0, 5);
  return (
    <details>
      <summary class="section-head">
        <h3>Recently cleaned</h3>
        <span class="badge">{entries.length + closed.length}</span>
      </summary>
      <div class="list" role="list">
        {shownClosed.map((s) => (
          <div class="item" role="listitem" key={s.id} title={s.groups.map((g) => g.title || 'Untitled').join(', ')}>
            <span class="dot" style={{ background: COLOR_HEX[s.groups[0]?.color ?? 'grey'] }} />
            <div class="grow">
              <div class="ellipsis">{s.name}</div>
              <div class="small muted ellipsis">
                closed {s.groups.length === 1 ? 'group' : `${s.groups.length} groups`} ·{' '}
                {s.groups.reduce((n, g) => n + g.tabs.length, 0)} tabs
              </div>
            </div>
            <button
              type="button"
              class="btn sm"
              onClick={() => run('Groups restored', () => send({ type: 'undoClose', ids: [s.id] }))}
            >
              <Icons.restore /> Restore
            </button>
          </div>
        ))}
        {shown.map((e) => (
          <div class="item" role="listitem" title={e.url}>
            <Favicon src={e.favIconUrl} />
            <div class="grow">
              <div class="ellipsis">{e.title}</div>
              <div class="small muted ellipsis">
                {reasonLabel[e.reason]}
                {e.groupTitle ? ` · ${e.groupTitle}` : ''}
              </div>
            </div>
            <button class="btn sm" onClick={() => run('Restored', () => send({ type: 'restoreCleaned', id: e.id }))}>
              <Icons.restore /> Restore
            </button>
          </div>
        ))}
        {entries.length > shown.length && (
          <button
            class="btn sm"
            style="align-self: flex-start; margin: 4px 8px"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            Show all {entries.length} in settings
          </button>
        )}
      </div>
    </details>
  );
}
