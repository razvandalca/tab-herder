import { useState } from 'preact/hooks';
import type { LocalState, Session } from '@/shared/types';
import { send } from '@/shared/messages';
import { COLOR_HEX } from '@/core/colors';
import type { PanelProps } from '../App';

interface Props extends PanelProps {
  local: LocalState;
}

export function SessionsPanel({ local, notify, fail }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saveName, setSaveName] = useState('');

  const saveCurrent = async (e: Event) => {
    e.preventDefault();
    try {
      const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      const s = await send<Session>({ type: 'saveSession', kind: 'window', windowId: win.id!, name: saveName });
      notify(`Saved “${s.name}”`);
      setSaveName('');
    } catch (err) {
      fail(err);
    }
  };

  const act = (label: string, p: Promise<unknown>) => p.then(() => notify(label)).catch(fail);
  const tabCount = (s: Session) => s.groups.reduce((n, g) => n + g.tabs.length, 0) + s.ungrouped.length;

  return (
    <section>
      <div class="card">
        <h2>Save current window</h2>
        <form class="row" onSubmit={saveCurrent}>
          <input class="input grow" placeholder="Session name" value={saveName} onInput={(e) => setSaveName((e.target as HTMLInputElement).value)} />
          <button class="btn primary" type="submit">Save</button>
        </form>
        <div class="hint">You can also save a single group from the popup menu or the right-click menu (“Save &amp; close”).</div>
      </div>
      <div class="card">
        <h2>Saved sessions <span class="badge">{local.sessions.length}</span></h2>
        {local.sessions.length === 0 && <div class="muted">No sessions saved yet.</div>}
        {local.sessions.map((s) => (
          <div class="card" key={s.id} style="gap: 8px">
            <div class="row between">
              {renaming === s.id ? (
                <form class="row grow" onSubmit={(e) => { e.preventDefault(); void act('Renamed', send({ type: 'renameSession', id: s.id, name })).then(() => setRenaming(null)); }}>
                  <input class="input sm grow" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoFocus />
                  <button class="btn sm primary" type="submit">Save</button>
                  <button class="btn sm" type="button" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <div class="grow">
                  <b>{s.name}</b>
                  <div class="small muted">{s.kind === 'window' ? 'Window' : 'Group'} · {tabCount(s)} tabs · {new Date(s.createdAt).toLocaleString()}</div>
                </div>
              )}
              <div class="row" style="gap: 4px">
                <button class="btn sm primary" onClick={() => act('Restored in a new window', send({ type: 'restoreSession', id: s.id }))}>Restore</button>
                <button class="btn sm" onClick={() => { setRenaming(s.id); setName(s.name); }}>Rename</button>
                <button class="btn sm danger" onClick={() => act('Deleted', send({ type: 'deleteSession', id: s.id }))}>Delete</button>
              </div>
            </div>
            <div class="chips">
              {s.groups.map((g, i) => (
                <span class="chip" key={i}><span class="dot" style={{ background: COLOR_HEX[g.color] }} /> {g.title || 'Untitled'} <span class="muted">({g.tabs.length})</span></span>
              ))}
              {s.ungrouped.length > 0 && <span class="chip">Ungrouped <span class="muted">({s.ungrouped.length})</span></span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
