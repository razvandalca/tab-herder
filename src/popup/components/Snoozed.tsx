import { useEffect, useState } from 'preact/hooks';
import { describeWake, snoozedLabel, sortSnoozed, type SnoozedItem } from '@/core/snooze';
import { send } from '@/shared/messages';
import { getSnoozed, onSnoozedChanged } from '@/shared/snoozeStore';
import type { TabSnapshot } from '@/shared/types';
import { COLOR_HEX } from '@/core/colors';
import { Favicon } from '@/ui/Favicon';
import { Icons } from '@/ui/icons';
import type { Runner } from '../App';
import { SnoozePicker } from './SnoozePicker';

function useSnoozed(): SnoozedItem[] {
  const [items, setItems] = useState<SnoozedItem[]>([]);
  useEffect(() => {
    void getSnoozed().then(setItems);
    return onSnoozedChanged(setItems);
  }, []);
  return items;
}

const snoozable = (t: TabSnapshot | undefined) => !!t && !t.incognito && /^(https?|ftp|file):/.test(t.url);

/** "Snooze this tab" plus the list of snoozed tabs/groups with wake now / cancel. */
export function Snoozed({ run, currentTab }: { run: Runner; currentTab?: TabSnapshot }) {
  const items = useSnoozed();
  const [picking, setPicking] = useState(false);
  const now = Date.now();
  if (!snoozable(currentTab) && !items.length) return null;

  return (
    <div class="stack">
      {snoozable(currentTab) && (
        picking ? (
          <SnoozePicker
            label="this tab"
            onCancel={() => setPicking(false)}
            onPick={(wakeAt) => {
              setPicking(false);
              void run(`Snoozed until ${describeWake(wakeAt, Date.now())}`, () => send({ type: 'snoozeTab', tabId: currentTab!.id, wakeAt }));
            }}
          />
        ) : (
          <button type="button" class="btn sm" style="align-self: flex-start" onClick={() => setPicking(true)}>
            Snooze this tab…
          </button>
        )
      )}
      {items.length > 0 && (
        <details open>
          <summary class="section-head">
            <h3>Snoozed</h3>
            <span class="badge">{items.length}</span>
          </summary>
          <div class="list" role="list" aria-label="Snoozed tabs and groups">
            {sortSnoozed(items).map((i) => (
              <div key={i.id} class="item" role="listitem" title={i.tabs.map((t) => t.url).join('\n')}>
                {i.kind === 'group' && i.group
                  ? <span class="dot" style={{ background: COLOR_HEX[i.group.color] }} />
                  : <Favicon src={i.tabs[0]?.favIconUrl} />}
                <div class="grow">
                  <div class="ellipsis">{snoozedLabel(i)}</div>
                  <div class="small muted ellipsis">{describeWake(i.wakeAt, now)}</div>
                </div>
                <button type="button" class="btn sm" onClick={() => run('Woken', () => send({ type: 'wakeSnoozed', id: i.id }))}>
                  <Icons.restore /> Wake now
                </button>
                <button
                  type="button"
                  class="btn sm"
                  title="Cancel the snooze and forget these tabs"
                  aria-label={`Cancel snooze for ${snoozedLabel(i)}`}
                  onClick={() => run('Snooze cancelled', () => send({ type: 'cancelSnoozed', id: i.id }))}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
