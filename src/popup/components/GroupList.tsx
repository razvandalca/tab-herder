import { useMemo, useState } from 'preact/hooks';
import type { GroupSnapshot, TabSnapshot } from '@/shared/types';
import { send } from '@/shared/messages';
import { GROUP_SORT_LABELS, type GroupSortKey } from '@/core/sorting';
import type { Runner } from '../App';
import { GroupRow } from './GroupRow';

interface Props {
  tabs: TabSnapshot[];
  groups: GroupSnapshot[];
  currentWindowId: number;
  run: Runner;
}

export function GroupList({ tabs, groups, currentWindowId, run }: Props) {
  const [confirmClose, setConfirmClose] = useState(false);
  const byGroup = useMemo(() => {
    const m = new Map<number, TabSnapshot[]>();
    for (const t of tabs) {
      if (t.groupId < 0) continue;
      const l = m.get(t.groupId) ?? [];
      l.push(t);
      m.set(t.groupId, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.index - b.index);
    return m;
  }, [tabs]);

  const order = (g: GroupSnapshot) => byGroup.get(g.id)?.[0]?.index ?? 0;
  const here = groups.filter((g) => g.windowId === currentWindowId).sort((a, b) => order(a) - order(b));
  const elsewhere = groups.filter((g) => g.windowId !== currentWindowId);

  return (
    <div class="stack">
      <div class="section-head">
        <h3>Groups in this window</h3>
        {here.length > 0 && (
          <div class="row" style="gap: 2px">
            <button
              class="btn sm"
              onClick={() =>
                run('Collapsed', () => send({ type: 'collapseAll', windowId: currentWindowId, collapsed: true }))
              }
            >
              Collapse all
            </button>
            <button
              class="btn sm"
              onClick={() =>
                run('Expanded', () => send({ type: 'collapseAll', windowId: currentWindowId, collapsed: false }))
              }
            >
              Expand all
            </button>
            <button
              class="btn sm"
              onClick={() => run('Ungrouped', () => send({ type: 'ungroupAll', windowId: currentWindowId }))}
            >
              Ungroup all
            </button>
            <button
              class="btn sm"
              style="color: var(--danger)"
              title="Close every group and its tabs in this window, without Chrome keeping them as saved groups"
              onClick={() => {
                if (!confirmClose) {
                  setConfirmClose(true);
                  return;
                }
                setConfirmClose(false);
                void run('Groups closed', () => send({ type: 'closeAllGroups', windowId: currentWindowId }));
              }}
              onBlur={() => setConfirmClose(false)}
            >
              {confirmClose ? `Close ${here.length} groups?` : 'Close all'}
            </button>
          </div>
        )}
      </div>
      {here.length > 1 && (
        <div class="row small muted" style="gap: 2px; padding: 0 8px" role="group" aria-label="Sort groups">
          <span style="margin-right: 4px">Sort groups</span>
          {(Object.entries(GROUP_SORT_LABELS) as Array<[GroupSortKey, string]>).map(([key, label]) => (
            <button
              key={key}
              class="btn sm"
              onClick={() => run('Groups sorted', () => send({ type: 'sortGroups', windowId: currentWindowId, key }))}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {here.length === 0 && (
        <div class="muted small" style="padding: 0 8px">
          No groups yet. Press “Group now” to create some.
        </div>
      )}
      <div class="list" role="list">
        {here.map((g) => (
          <GroupRow key={g.id} group={g} tabs={byGroup.get(g.id) ?? []} run={run} />
        ))}
      </div>
      {elsewhere.length > 0 && (
        <details>
          <summary class="section-head">
            <h3>Other windows</h3>
            <span class="badge">{elsewhere.length}</span>
          </summary>
          <div class="list" role="list">
            {elsewhere.map((g) => (
              <GroupRow key={g.id} group={g} tabs={byGroup.get(g.id) ?? []} run={run} otherWindow />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
