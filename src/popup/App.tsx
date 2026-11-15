import { useMemo, useState } from 'preact/hooks';
import { fuzzySearch } from '@/core/fuzzy';
import { paletteQuery } from '@/core/palette';
import { send, type CloseResult } from '@/shared/messages';
import { NO_GROUP } from '@/shared/types';
import { errorMessage, useBrowserState, useLocal, useStats, useToast } from '@/ui/hooks';
import { Icons } from '@/ui/icons';
import { isSidePanel, openSidePanel } from '@/ui/surface';
import { SearchBox } from './components/SearchBox';
import { StatsBar } from './components/StatsBar';
import { QuickActions } from './components/QuickActions';
import { GroupList } from './components/GroupList';
import { TabRow } from './components/TabRow';
import { RecentlyCleaned } from './components/RecentlyCleaned';
import { Snoozed } from './components/Snoozed';
import { ProfileSwitcher } from './components/ProfileSwitcher';
import { CommandList, usePalette } from './components/CommandPalette';

export function App() {
  const [browser, refresh] = useBrowserState();
  const local = useLocal();
  const [query, setQuery] = useState('');
  const [toast, showToast, toastAction, dismissToast] = useToast();
  const [tick, setTick] = useState(0);
  const stats = useStats([tick, browser?.tabs.length, browser?.groups.length, local?.stats]);

  const results = useMemo(() => {
    if (!browser || !query.trim() || paletteQuery(query) !== null) return [];
    const own = `chrome-extension://${chrome.runtime.id}/`;
    return fuzzySearch(query, browser.tabs.filter((t) => !t.url.startsWith(own)), 40);
  }, [browser, query]);

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      const r = await fn();
      if (isCloseResult(r)) {
        const undo = r.undo;
        showToast(`${label}: ${r.closed}`, undo.length ? { label: 'Undo', onClick: () => {
          dismissToast();
          void run('Groups restored', () => send({ type: 'undoClose', ids: undo }));
        } } : undefined);
      } else showToast(typeof r === 'number' ? `${label}: ${r}` : label);
      refresh();
      setTick((t) => t + 1);
    } catch (e) {
      showToast(`Error: ${errorMessage(e)}`);
    }
  }

  const palette = usePalette({
    query: paletteQuery(query),
    groups: browser?.groups ?? [],
    currentWindowId: browser?.currentWindowId ?? -1,
    run,
    exit: () => setQuery(''),
  });

  return (
    <div class="app">
      <div class="row between">
        <h1>Tab Herder</h1>
        <div class="row">
        <ProfileSwitcher notify={showToast} />
        {!isSidePanel() && browser && (
          <button
            type="button"
            class="btn icon"
            title="Open in side panel"
            aria-label="Open in side panel"
            onClick={() => void openSidePanel(browser.currentWindowId).then(() => window.close(), (e) => showToast(`Error: ${errorMessage(e)}`))}
          >
            <Icons.sidePanel />
          </button>
        )}
        <button class="btn icon" title="Settings" aria-label="Open settings" onClick={() => chrome.runtime.openOptionsPage()}>
          <Icons.gear />
        </button>
        </div>
      </div>

      <SearchBox value={query} onChange={setQuery} onKeyDown={palette.onKeyDown} />

      {palette.active ? (
        <CommandList {...palette} />
      ) : query.trim() ? (
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
          <Snoozed run={run} currentTab={browser?.tabs.find((t) => t.active && t.windowId === browser.currentWindowId)} />
          {local && <RecentlyCleaned entries={local.recentlyCleaned} closed={local.sessions.filter((s) => s.autoSaved)} run={run} />}
        </>
      )}
      {toast && (
        <div class="toast" role="status">
          {toast}
          {toastAction && <button type="button" class="toast-action" onClick={toastAction.onClick}>{toastAction.label}</button>}
        </div>
      )}
    </div>
  );
}

function isCloseResult(r: unknown): r is CloseResult {
  return typeof r === 'object' && r !== null && typeof (r as CloseResult).closed === 'number' && Array.isArray((r as CloseResult).undo);
}

export type Runner = (label: string, fn: () => Promise<unknown>) => Promise<void>;
export { send };
