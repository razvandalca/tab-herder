import { useState } from 'preact/hooks';
import type { Autosave, AutosaveSettings, LocalState, Session, Settings } from '@/shared/types';
import { send } from '@/shared/messages';
import { COLOR_HEX } from '@/core/colors';
import { AUTOSAVE_KEEP_MAX, autosaveLabel, clampKeep, tabCount as windowTabs } from '@/core/autosave';
import { CLOSED_SESSIONS_MAX } from '@/shared/defaults';
import type { PanelProps } from '../App';

interface Props extends PanelProps {
  local: LocalState;
  settings: Settings;
  save: (s: Settings) => Promise<void>;
}

export function SessionsPanel({ local, settings, save, notify, fail }: Props) {
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

  const a = settings.autosave;
  const setAutosave = (patch: Partial<AutosaveSettings>) =>
    save({ ...settings, autosave: { ...a, ...patch } }).catch(fail);
  const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
  const snapshotNow = () =>
    send<Autosave | null>({ type: 'autosaveNow' })
      .then((r) => notify(r ? 'Snapshot saved' : 'Nothing changed since the last autosave'))
      .catch(fail);
  const autosaves = [...local.autosaves].sort((x, y) => y.createdAt - x.createdAt);

  return (
    <section>
      <div class="card">
        <h2>Save current window</h2>
        <form class="row" onSubmit={saveCurrent}>
          <input
            class="input grow"
            placeholder="Session name"
            value={saveName}
            onInput={(e) => setSaveName((e.target as HTMLInputElement).value)}
          />
          <button class="btn primary" type="submit">
            Save
          </button>
        </form>
        <div class="hint">
          You can also save a single group from the popup menu or the right-click menu (“Save &amp; close”). Groups
          closed with “Close all” or “Close group” are kept here automatically (the last {CLOSED_SESSIONS_MAX}) so you
          can restore them.
        </div>
      </div>
      <div class="card">
        <h2>
          Saved sessions <span class="badge">{local.sessions.length}</span>
        </h2>
        {local.sessions.length === 0 && <div class="muted">No sessions saved yet.</div>}
        {local.sessions.map((s) => (
          <div class="card" key={s.id} style="gap: 8px">
            <div class="row between">
              {renaming === s.id ? (
                <form
                  class="row grow"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('Renamed', send({ type: 'renameSession', id: s.id, name })).then(() => setRenaming(null));
                  }}
                >
                  <input
                    class="input sm grow"
                    value={name}
                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                    autoFocus
                  />
                  <button class="btn sm primary" type="submit">
                    Save
                  </button>
                  <button class="btn sm" type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div class="grow">
                  <b>{s.name}</b>
                  <div class="small muted">
                    {s.autoSaved ? 'Closed groups (auto-saved)' : s.kind === 'window' ? 'Window' : 'Group'} ·{' '}
                    {tabCount(s)} tabs · {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
              <div class="row" style="gap: 4px">
                <button
                  class="btn sm primary"
                  onClick={() => act('Restored in a new window', send({ type: 'restoreSession', id: s.id }))}
                >
                  Restore
                </button>
                <button
                  class="btn sm"
                  onClick={() => {
                    setRenaming(s.id);
                    setName(s.name);
                  }}
                >
                  Rename
                </button>
                <button class="btn sm danger" onClick={() => act('Deleted', send({ type: 'deleteSession', id: s.id }))}>
                  Delete
                </button>
              </div>
            </div>
            <div class="chips">
              {s.groups.map((g, i) => (
                <span class="chip" key={i}>
                  <span class="dot" style={{ background: COLOR_HEX[g.color] }} /> {g.title || 'Untitled'}{' '}
                  <span class="muted">({g.tabs.length})</span>
                </span>
              ))}
              {s.ungrouped.length > 0 && (
                <span class="chip">
                  Ungrouped <span class="muted">({s.ungrouped.length})</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div class="card" data-testid="autosaves">
        <div class="row between">
          <h2>
            Autosaves <span class="badge">{autosaves.length}</span>
          </h2>
          <button type="button" class="btn" onClick={() => void snapshotNow()}>
            Snapshot now
          </button>
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={a.enabled}
            onChange={(e) => void setAutosave({ enabled: (e.target as HTMLInputElement).checked })}
          />
          <span>
            <span class="title">Automatically snapshot all windows</span>
            <br />
            <span class="hint">
              Crash protection: saves every window's groups and tabs on a schedule, only when something changed.
              Incognito windows are never saved.
            </span>
          </span>
        </label>
        <div class="grid2">
          <label class="field">
            <span>Snapshot every (minutes)</span>
            <input
              class="input"
              type="number"
              min={1}
              value={a.intervalMinutes}
              disabled={!a.enabled}
              onChange={(e) => void setAutosave({ intervalMinutes: Math.max(1, num(e)) })}
            />
          </label>
          <label class="field">
            <span>Keep the last</span>
            <input
              class="input"
              type="number"
              min={1}
              max={AUTOSAVE_KEEP_MAX}
              value={a.keep}
              onChange={(e) => void setAutosave({ keep: clampKeep(num(e)) })}
            />
            <span class="hint">Older autosaves are deleted automatically (max {AUTOSAVE_KEEP_MAX}).</span>
          </label>
        </div>
        {autosaves.length === 0 && <div class="muted">No autosaves yet.</div>}
        {autosaves.map((s) => {
          const tabs = s.windows.reduce((n, w) => n + windowTabs(w), 0);
          return (
            <div class="card" key={s.id} style="gap: 8px">
              <div class="row between">
                <div class="grow">
                  <b>{autosaveLabel(s)}</b>
                  <div class="small muted">
                    {s.windows.length} {s.windows.length === 1 ? 'window' : 'windows'} · {tabs} tabs
                  </div>
                </div>
                <div class="row" style="gap: 4px">
                  <button
                    type="button"
                    class="btn sm primary"
                    onClick={() =>
                      act(
                        s.windows.length === 1 ? 'Restored in a new window' : `Restored ${s.windows.length} windows`,
                        send({ type: 'restoreAutosave', id: s.id }),
                      )
                    }
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    class="btn sm danger"
                    onClick={() => act('Deleted', send({ type: 'deleteAutosave', id: s.id }))}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div class="chips">
                {s.windows
                  .flatMap((w) => w.groups)
                  .map((g, i) => (
                    <span class="chip" key={i}>
                      <span class="dot" style={{ background: COLOR_HEX[g.color] }} /> {g.title || 'Untitled'}{' '}
                      <span class="muted">({g.tabs.length})</span>
                    </span>
                  ))}
                {s.windows.some((w) => w.ungrouped.length) && (
                  <span class="chip">
                    Ungrouped <span class="muted">({s.windows.reduce((n, w) => n + w.ungrouped.length, 0)})</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
