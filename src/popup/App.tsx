import { useMemo, useState } from 'preact/hooks';
import { fuzzySearch } from '@/core/fuzzy';
import { send } from '@/shared/messages';
import { NO_GROUP } from '@/shared/types';
import { errorMessage, useBrowserState, useLocal, useStats, useToast } from '@/ui/hooks';
import { Icons } from '@/ui/icons';
import { SearchBox } from './components/SearchBox';
import { StatsBar } from './components/StatsBar';
import { QuickActions } from './components/QuickActions';
import { GroupList } from './components/GroupList';
import { TabRow } from './components/TabRow';
import { RecentlyCleaned } from './components/RecentlyCleaned';
import { ProfileSwitcher } from './components/ProfileSwitcher';

export function App() {
  const [browser, refresh] = useBrowserState();
  const local = useLocal();
  const [query, setQuery] = useState('');
  const [toast, showToast] = useToast();
  const [tick, setTick] = useState(0);
  const stats = useStats([tick, browser?.tabs.length, browser?.groups.length, local?.stats]);

  const results = useMemo(() => {
    if (!browser || !query.trim()) return [];
    const own = `chrome-extension://${chrome.runtime.id}/`;
    return fuzzySearch(query, browser.tabs.filter((t) => !t.url.startsWith(own)), 40);
  }, [browser, query]);

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      const r = await fn();
      showToast(typeof r === 'number' ? `${label}: ${r}` : label);
      refresh();
      setTick((t) => t + 1);
    } catch (e) {
      showToast(`Error: ${errorMessage(e)}`);
    }
  }

  return (
    <div class="app">
      <div class="row between">
        <h1>Tab Herder</h1>
        <ProfileSwitcher notify={showToast} />
        <button class="btn icon" title="Settings" aria-label="Open settings" onClick={() => chrome.runtime.openOptionsPage()}>
          <Icons.gear />
        </button>
      </div>

      <SearchBox value={query} onChange={setQuery} />

      {query.trim() ? (
        <div class="list" role="list" aria-label="Search results">
          {results.length === 0 && <div class="muted" style="padding: 8px">No matching tabs</div>}
          {results.map((t) => (
            <TabRow key={t.id} tab={t} showWindow={browser ? t.windowId !== browser.currentWindowId : false} />
          ))}
        </div>
      ) : (
        <>
          <StatsBar stats={stats} />
          <QuickActions run={run} currentWindowId={browser?.currentWindowId ?? -1} />
          {browser && (
            <GroupList
              tabs={browser.tabs}
              groups={browser.groups}
              currentWindowId={browser.currentWindowId}
              run={run}
            />
          )}
          {browser && browser.tabs.filter((t) => t.windowId === browser.currentWindowId && t.groupId === NO_GROUP).length > 0 && (
            <details>
              <summary class="section-head">
                <h3>Ungrouped</h3>
                <span class="badge">{browser.tabs.filter((t) => t.windowId === browser.currentWindowId && t.groupId === NO_GROUP).length}</span>
              </summary>
              <div class="list">
                {browser.tabs
                  .filter((t) => t.windowId === browser.currentWindowId && t.groupId === NO_GROUP)
                  .sort((a, b) => a.index - b.index)
                  .map((t) => <TabRow key={t.id} tab={t} />)}
              </div>
            </details>
          )}
          {local && <RecentlyCleaned entries={local.recentlyCleaned} run={run} />}
        </>
      )}
      {toast && <div class="toast" role="status">{toast}</div>}
    </div>
  );
}

export type Runner = (label: string, fn: () => Promise<unknown>) => Promise<void>;
export { send };
