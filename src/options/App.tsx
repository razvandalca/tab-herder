import { useEffect, useState } from 'preact/hooks';
import { errorMessage, useLocal, useSettings, useToast } from '@/ui/hooks';
import { GroupingSettings } from './components/GroupingSettings';
import { RulesEditor } from './components/RulesEditor';
import { CleanupSettings } from './components/CleanupSettings';
import { SessionsPanel } from './components/SessionsPanel';
import { ImportExport } from './components/ImportExport';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { InsightsPanel } from './components/InsightsPanel';

const TABS = [
  ['grouping', 'Grouping'],
  ['rules', 'Rules'],
  ['cleanup', 'Cleanup'],
  ['sessions', 'Sessions'],
  ['insights', 'Insights'],
  ['data', 'Import / Export'],
  ['shortcuts', 'Shortcuts'],
] as const;
type TabId = (typeof TABS)[number][0];

export function App() {
  const [settings, save] = useSettings();
  const local = useLocal();
  const [toast, showToast] = useToast();
  const [tab, setTab] = useState<TabId>(() => (location.hash.slice(1) as TabId) || 'grouping');

  useEffect(() => {
    if (location.hash.slice(1) !== tab) location.hash = tab;
  }, [tab]);
  useEffect(() => {
    const onHash = () => {
      const id = location.hash.slice(1) as TabId;
      if (TABS.some(([t]) => t === id)) setTab(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const notify = (msg: string) => showToast(msg);
  const fail = (e: unknown) => showToast(`Error: ${errorMessage(e)}`);

  if (!settings || !local) return <div class="app muted">Loading…</div>;

  return (
    <div class="app">
      <header>
        <img src="/icons/icon-32.png" width="28" height="28" alt="" />
        <h1 style="font-size: 20px">Tab Herder settings</h1>
      </header>
      <nav aria-label="Settings sections">
        {TABS.map(([id, label]) => (
          <button key={id} class={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'grouping' && <GroupingSettings settings={settings} save={save} notify={notify} fail={fail} />}
      {tab === 'rules' && <RulesEditor settings={settings} save={save} notify={notify} />}
      {tab === 'cleanup' && <CleanupSettings settings={settings} save={save} local={local} notify={notify} fail={fail} />}
      {tab === 'sessions' && <SessionsPanel settings={settings} save={save} local={local} notify={notify} fail={fail} />}
      {tab === 'insights' && <InsightsPanel local={local} notify={notify} fail={fail} />}
      {tab === 'data' && <ImportExport settings={settings} local={local} notify={notify} fail={fail} />}
      {tab === 'shortcuts' && <ShortcutsPanel />}
      {toast && <div class="toast" role="status">{toast}</div>}
    </div>
  );
}

export interface PanelProps {
  notify: (msg: string) => void;
  fail: (e: unknown) => void;
}
