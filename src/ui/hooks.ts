import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getLocal, getSettings, onLocalChanged, onSettingsChanged, saveSettings } from '@/shared/storage';
import type { GroupSnapshot, LocalState, Settings, TabSnapshot } from '@/shared/types';
import { snapshotGroup, snapshotTab } from '@/background/tabs';
import { send, type Stats } from '@/shared/messages';

export function useSettings(): [Settings | null, (next: Settings) => Promise<void>] {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);
  const save = useCallback(async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);
  return [settings, save];
}

export function useLocal(): LocalState | null {
  const [local, setLocal] = useState<LocalState | null>(null);
  useEffect(() => {
    void getLocal().then(setLocal);
    return onLocalChanged(setLocal);
  }, []);
  return local;
}

export interface BrowserState {
  tabs: TabSnapshot[];
  groups: GroupSnapshot[];
  currentWindowId: number;
}

/** Live view of tabs and groups; refreshes on any tab/group event while the page is open. */
export function useBrowserState(): [BrowserState | null, () => void] {
  const [state, setState] = useState<BrowserState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const [tabs, groups, win] = await Promise.all([
        chrome.tabs.query({}),
        chrome.tabGroups.query({}),
        chrome.windows.getCurrent(),
      ]);
      setState({
        tabs: tabs.map(snapshotTab).filter((t): t is TabSnapshot => t !== null),
        groups: groups.map(snapshotGroup),
        currentWindowId: win.id ?? -1,
      });
    }, 60);
  }, []);
  useEffect(() => {
    refresh();
    const events = [
      chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onMoved,
      chrome.tabs.onActivated, chrome.tabs.onAttached, chrome.tabs.onDetached,
      chrome.tabGroups.onCreated, chrome.tabGroups.onRemoved, chrome.tabGroups.onUpdated, chrome.tabGroups.onMoved,
    ] as Array<{ addListener(cb: () => void): void; removeListener(cb: () => void): void }>;
    for (const e of events) e.addListener(refresh);
    return () => {
      for (const e of events) e.removeListener(refresh);
    };
  }, [refresh]);
  return [state, refresh];
}

export function useStats(deps: unknown[] = []): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    void send<Stats>({ type: 'getStats' }).then(setStats).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return stats;
}

export function useToast(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2200);
  }, []);
  return [msg, show];
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
