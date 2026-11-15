import type { GroupSnapshot, Rule, Settings, TabSnapshot } from '@/shared/types';
import { DEFAULT_SETTINGS } from '@/shared/defaults';

let nextId = 1;

export function tab(partial: Partial<TabSnapshot> & { url: string }): TabSnapshot {
  const id = partial.id ?? nextId++;
  return {
    id,
    windowId: 1,
    index: id,
    title: partial.url,
    pinned: false,
    active: false,
    audible: false,
    discarded: false,
    incognito: false,
    groupId: -1,
    ...partial,
  };
}

export function group(partial: Partial<GroupSnapshot> & { id: number; title: string }): GroupSnapshot {
  return { windowId: 1, color: 'blue', collapsed: false, ...partial };
}

export function rule(partial: Partial<Rule> & { pattern: string; name: string }): Rule {
  return { id: `r-${partial.name}-${partial.pattern}`, color: 'auto', matchType: 'domain', enabled: true, ...partial };
}

export function settings(partial: Partial<Settings> = {}, cleanup: Partial<Settings['cleanup']> = {}): Settings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...partial,
    cleanup: { ...structuredClone(DEFAULT_SETTINGS.cleanup), ...cleanup },
  };
}

export function resetIds() {
  nextId = 1;
}
