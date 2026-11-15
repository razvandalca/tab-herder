import type { Settings } from '@/shared/types';
import type { PanelProps } from '../App';
import { releaseContentPermissionIfUnused, requestContentPermission } from '../permissions';

interface Props extends PanelProps {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
}

export function GroupingSettings({ settings, save, notify, fail }: Props) {
  const set = (patch: Partial<Settings>) => save({ ...settings, ...patch });

  const toggleContentGrouping = async (enabled: boolean) => {
    try {
      if (enabled) {
        const ok = await requestContentPermission();
        if (!ok) return notify('Permission not granted');
      } else {
        await releaseContentPermissionIfUnused(settings.cleanup.detectUnsavedForms);
      }
      await set({ contentGrouping: enabled });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section>
      <div class="card">
        <h2>Mode</h2>
        {(
          [
            ['off', 'Off', 'Never group automatically; the popup actions still work.'],
            ['manual', 'Group on demand', 'Only when you press “Group now”, use the shortcut or the context menu.'],
            ['auto', 'Auto-group new tabs', 'Group tabs as they load. Tabs you move by hand are left alone.'],
          ] as const
        ).map(([value, label, hint]) => (
          <label class="check" key={value}>
            <input type="radio" name="mode" checked={settings.mode === value} onChange={() => set({ mode: value })} />
            <span><span class="title">{label}</span><br /><span class="hint">{hint}</span></span>
          </label>
        ))}
      </div>

      <div class="card">
        <h2>Domain grouping</h2>
        <label class="check">
          <input type="checkbox" checked={settings.groupByDomain} onChange={(e) => set({ groupByDomain: (e.target as HTMLInputElement).checked })} />
          <span><span class="title">Group by domain when no rule matches</span><br /><span class="hint">Tabs without a matching rule are grouped by site.</span></span>
        </label>
        <label class="check">
          <input type="checkbox" checked={settings.mergeSubdomains} disabled={!settings.groupByDomain} onChange={(e) => set({ mergeSubdomains: (e.target as HTMLInputElement).checked })} />
          <span><span class="title">Merge subdomains</span><br /><span class="hint">docs.github.com and github.com share one group.</span></span>
        </label>
        <div class="grid2">
          <label class="field">
            <span>Minimum group size</span>
            <input class="input" type="number" min={1} max={20} value={settings.minGroupSize} onChange={(e) => set({ minGroupSize: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) })} />
            <span class="hint">Don’t create a new group for fewer tabs than this. Existing groups still accept single tabs.</span>
          </label>
        </div>
        <label class="check">
          <input type="checkbox" checked={settings.includeIncognito} onChange={(e) => set({ includeIncognito: (e.target as HTMLInputElement).checked })} />
          <span><span class="title">Include incognito tabs</span><br /><span class="hint">Also requires “Allow in Incognito” for Tab Herder on chrome://extensions.</span></span>
        </label>
      </div>

      <div class="card">
        <h2>Group by content <span class="badge">experimental</span></h2>
        <label class="check">
          <input type="checkbox" checked={settings.contentGrouping} onChange={(e) => void toggleContentGrouping((e.target as HTMLInputElement).checked)} />
          <span>
            <span class="title">Classify tabs into categories (Dev, Docs, Video, Shopping, …)</span><br />
            <span class="hint">
              Uses a local keyword heuristic on the title, URL and meta description. No external calls. Needs permission to read page
              descriptions on all sites; Chrome will ask when you enable it. Rules still take precedence.
            </span>
          </span>
        </label>
      </div>

      <div class="card">
        <h2>Badge</h2>
        <label class="check">
          <input type="checkbox" checked={settings.badge.enabled} onChange={(e) => set({ badge: { ...settings.badge, enabled: (e.target as HTMLInputElement).checked } })} />
          <span class="title">Show the open-tab count on the icon</span>
        </label>
        <div class="grid2">
          <label class="field">
            <span>Turn the badge red at</span>
            <input class="input" type="number" min={0} value={settings.badge.threshold} disabled={!settings.badge.enabled} onChange={(e) => set({ badge: { ...settings.badge, threshold: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) } })} />
            <span class="hint">0 disables the colour change.</span>
          </label>
        </div>
      </div>
    </section>
  );
}
