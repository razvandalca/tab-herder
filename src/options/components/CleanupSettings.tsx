import { useState } from 'preact/hooks';
import type { CleanupSettings as CleanupCfg, LocalState, Settings } from '@/shared/types';
import { send } from '@/shared/messages';
import { Favicon } from '@/ui/Favicon';
import type { PanelProps } from '../App';
import { releaseContentPermissionIfUnused, requestContentPermission } from '../permissions';
import { Allowlist } from './Allowlist';

interface Props extends PanelProps {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
  local: LocalState;
}

export function CleanupSettings({ settings, save, local, notify, fail }: Props) {
  const c = settings.cleanup;
  const set = (patch: Partial<CleanupCfg>) => save({ ...settings, cleanup: { ...c, ...patch } });
  const [busy, setBusy] = useState(false);

  const toggleForms = async (enabled: boolean) => {
    try {
      if (enabled) {
        const ok = await requestContentPermission();
        if (!ok) return notify('Permission not granted');
      } else {
        await releaseContentPermissionIfUnused(settings.contentGrouping);
      }
      await set({ detectUnsavedForms: enabled });
    } catch (e) {
      fail(e);
    }
  };

  const cleanNow = async () => {
    setBusy(true);
    try {
      const r = await send<{ closed: number; discarded: number }>({ type: 'cleanupNow' });
      notify(`Closed ${r.closed}, discarded ${r.discarded}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;

  return (
    <section>
      <div class="card">
        <div class="row between">
          <h2>Scheduled cleanup</h2>
          <button class="btn" disabled={busy} onClick={() => void cleanNow()}>Clean up now</button>
        </div>
        <label class="check">
          <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: (e.target as HTMLInputElement).checked })} />
          <span class="title">Run cleanup automatically</span>
        </label>
        <div class="grid2">
          <label class="field">
            <span>Check every (minutes)</span>
            <input class="input" type="number" min={1} value={c.intervalMinutes} disabled={!c.enabled} onChange={(e) => set({ intervalMinutes: Math.max(1, num(e)) })} />
          </label>
          <label class="field">
            <span>Tabs count as inactive after (hours)</span>
            <input class="input" type="number" min={0} step={0.5} value={c.inactiveHours} onChange={(e) => set({ inactiveHours: Math.max(0, num(e)) })} />
            <span class="hint">0 turns inactivity handling off.</span>
          </label>
        </div>
        <div class="field">
          <span>What to do with inactive tabs</span>
          <label class="check">
            <input type="radio" name="inactiveAction" checked={c.inactiveAction === 'discard'} onChange={() => set({ inactiveAction: 'discard' })} />
            <span><span class="title">Discard (recommended)</span><br /><span class="hint">Frees memory; the tab stays in the strip and reloads when clicked.</span></span>
          </label>
          <label class="check">
            <input type="radio" name="inactiveAction" checked={c.inactiveAction === 'close'} onChange={() => set({ inactiveAction: 'close' })} />
            <span><span class="title">Close</span><br /><span class="hint">Closed tabs go to “Recently cleaned” (last 100) and can be restored.</span></span>
          </label>
        </div>
        <label class="check">
          <input type="checkbox" checked={c.closeDuplicates} onChange={(e) => set({ closeDuplicates: (e.target as HTMLInputElement).checked })} />
          <span><span class="title">Close duplicate tabs</span><br /><span class="hint">Same URL after removing #fragments and tracking parameters (utm_*, fbclid, gclid, …).</span></span>
        </label>
        <label class="check">
          <input type="checkbox" checked={c.detectUnsavedForms} onChange={(e) => void toggleForms((e.target as HTMLInputElement).checked)} />
          <span>
            <span class="title">Never touch tabs with unsaved form input</span><br />
            <span class="hint">Needs permission to run a tiny script on all sites that watches for typing. Chrome will ask when you enable it.</span>
          </span>
        </label>
        <div class="hint">Pinned tabs, tabs playing audio and the active tab of each window are never closed or discarded.</div>
      </div>

      <div class="card">
        <h2>Allowlist</h2>
        <div class="hint">Domains that are never closed or discarded (subdomains included).</div>
        <Allowlist value={c.allowlist} onChange={(allowlist) => void set({ allowlist })} />
      </div>

      <div class="card">
        <div class="row between">
          <h2>Recently cleaned <span class="badge">{local.recentlyCleaned.length}</span></h2>
          {local.recentlyCleaned.length > 0 && (
            <button class="btn sm" onClick={() => send({ type: 'clearCleaned' }).then(() => notify('Cleared')).catch(fail)}>Clear list</button>
          )}
        </div>
        {local.recentlyCleaned.length === 0 && <div class="muted">Nothing has been cleaned yet.</div>}
        <div class="list">
          {local.recentlyCleaned.map((e) => (
            <div class="item" key={e.id} title={e.url}>
              <Favicon src={e.favIconUrl} />
              <div class="grow">
                <div class="ellipsis">{e.title}</div>
                <div class="small muted ellipsis">
                  {new Date(e.closedAt).toLocaleString()} · {e.reason === 'groupAutoClose' ? 'group auto-close' : e.reason}
                  {e.groupTitle ? ` · ${e.groupTitle}` : ''}
                </div>
              </div>
              <button class="btn sm" onClick={() => send({ type: 'restoreCleaned', id: e.id }).then(() => notify('Restored')).catch(fail)}>Restore</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
