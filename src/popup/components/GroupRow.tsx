import { useEffect, useRef, useState } from 'preact/hooks';
import type { GroupColor, GroupSnapshot, TabSnapshot } from '@/shared/types';
import { COLOR_HEX } from '@/core/colors';
import { send } from '@/shared/messages';
import { Icons } from '@/ui/icons';
import { ColorPicker } from '@/ui/ColorPicker';
import type { Runner } from '../App';
import { TabRow } from './TabRow';
import { SnoozePicker } from './SnoozePicker';
import { describeWake } from '@/core/snooze';

interface Props {
  group: GroupSnapshot;
  tabs: TabSnapshot[];
  run: Runner;
  otherWindow?: boolean;
}

export function GroupRow({ group, tabs, run, otherWindow }: Props) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<null | 'rename' | 'save' | 'snooze'>(null);
  const [text, setText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menu]);

  const act = (label: string, fn: () => Promise<unknown>) => {
    setMenu(false);
    return run(label, fn);
  };
  const title = group.title || 'Untitled group';

  const submit = async (e: Event) => {
    e.preventDefault();
    if (editing === 'rename') await act('Renamed', () => send({ type: 'renameGroup', groupId: group.id, title: text }));
    if (editing === 'save') await act('Saved and closed', () => send({ type: 'saveAndCloseGroup', groupId: group.id, name: text }));
    setEditing(null);
  };

  return (
    <div role="listitem">
      <div class="item group-row">
        <button class="btn icon" aria-label={open ? 'Hide tabs' : 'Show tabs'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span class={`chev ${open ? 'open' : ''}`}>▸</span>
        </button>
        <span class="dot" style={{ background: COLOR_HEX[group.color] }} />
        <div class="grow ellipsis title" title={title}>
          {title}
          {group.collapsed ? <span class="muted small"> · collapsed</span> : null}
        </div>
        <span class="badge">{tabs.length}</span>
        <div class="menu" ref={menuRef}>
          <button class="btn icon" aria-label={`Actions for ${title}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icons.more />
          </button>
          {menu && (
            <div class="menu-popup" role="menu">
              <button role="menuitem" onClick={() => act(group.collapsed ? 'Expanded' : 'Collapsed', () => send({ type: 'setCollapsed', groupId: group.id, collapsed: !group.collapsed }))}>
                {group.collapsed ? 'Expand' : 'Collapse'}
              </button>
              <button role="menuitem" onClick={() => { setMenu(false); setText(group.title); setEditing('rename'); }}>Rename…</button>
              <div style="padding: 6px 10px">
                <div class="small muted" style="margin-bottom: 4px">Colour</div>
                <ColorPicker value={group.color} onChange={(c) => act('Recoloured', () => send({ type: 'recolorGroup', groupId: group.id, color: c as GroupColor }))} />
              </div>
              <hr />
              <button role="menuitem" onClick={() => { setMenu(false); setText(group.title); setEditing('save'); }}>Save &amp; close…</button>
              <button role="menuitem" onClick={() => { setMenu(false); setEditing('snooze'); }}>Snooze…</button>
              <button role="menuitem" onClick={() => act('Moved to new window', () => send({ type: 'moveGroupToNewWindow', groupId: group.id }))}>Move to new window</button>
              <button role="menuitem" onClick={() => act('Ungrouped', () => send({ type: 'ungroup', groupId: group.id }))}>Ungroup</button>
              <hr />
              <button role="menuitem" style="color: var(--danger)" onClick={() => act('Group closed', () => send({ type: 'closeGroup', groupId: group.id }))}>Close all tabs</button>
            </div>
          )}
        </div>
      </div>
      {editing === 'snooze' && (
        <div style="padding: 4px 8px">
          <SnoozePicker
            label={title}
            onCancel={() => setEditing(null)}
            onPick={(wakeAt) => {
              setEditing(null);
              void act(`Snoozed until ${describeWake(wakeAt, Date.now())}`, () => send({ type: 'snoozeGroup', groupId: group.id, wakeAt }));
            }}
          />
        </div>
      )}
      {editing && editing !== 'snooze' && (
        <form class="inline-form" onSubmit={submit}>
          <input class="input sm grow" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder={editing === 'rename' ? 'Group name' : 'Session name'} autoFocus />
          <button class="btn sm primary" type="submit">{editing === 'rename' ? 'Rename' : 'Save & close'}</button>
          <button class="btn sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
        </form>
      )}
      {open && (
        <div class="list tabs-in-group">
          {tabs.map((t) => <TabRow key={t.id} tab={t} showWindow={otherWindow} />)}
        </div>
      )}
    </div>
  );
}
