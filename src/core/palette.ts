import type { Request } from '@/shared/messages';
import type { GroupSnapshot } from '@/shared/types';
import { fuzzyScore } from './fuzzy';
import { GROUP_SORT_LABELS, TAB_SORT_LABELS, type GroupSortKey, type TabSortKey } from './sorting';

/** Prefix that switches the popup search from tab search to the command palette. */
export const PALETTE_PREFIX = '>';

/**
 * A command the palette can run. Commands that take an argument (e.g. a session name) list
 * `phrases`: when the query starts with one of them, the rest of the query is the argument.
 */
export interface PaletteCommand {
  id: string;
  /** Builds the label shown in the list, given the parsed argument ('' when none). */
  label: (arg: string) => string;
  /** Extra words that should match, besides the label. */
  keywords?: string;
  /** Builds the message to send to the service worker. */
  request: (arg: string) => Request;
  /** Toast shown after the command ran. */
  done: string;
  /** Destructive commands ask for a second Enter/click before running. */
  confirm?: string;
  phrases?: string[];
}

export interface PaletteMatch {
  command: PaletteCommand;
  arg: string;
  label: string;
}

/** Returns the palette query (text after `>`) when the input is in palette mode, else null. */
export function paletteQuery(input: string): string | null {
  const s = input.trimStart();
  return s.startsWith(PALETTE_PREFIX) ? s.slice(PALETTE_PREFIX.length).trim() : null;
}

function quote(title: string): string {
  return `“${title || 'Untitled group'}”`;
}

/** Builds the full list of commands for the current window's state. */
export function buildCommands(groups: GroupSnapshot[], currentWindowId: number): PaletteCommand[] {
  const here = groups.filter((g) => g.windowId === currentWindowId);
  const others = groups.filter((g) => g.windowId !== currentWindowId);
  const windowId = currentWindowId;
  const cmds: PaletteCommand[] = [
    { id: 'groupNow', label: () => 'Group now', keywords: 'group tabs auto', request: () => ({ type: 'groupNow' }), done: 'Tabs grouped' },
    { id: 'cleanupNow', label: () => 'Clean up', keywords: 'cleanup discard inactive', request: () => ({ type: 'cleanupNow' }), done: 'Cleaned up' },
    { id: 'closeDuplicates', label: () => 'Close duplicates', keywords: 'dedupe duplicate tabs', request: () => ({ type: 'closeDuplicates' }), done: 'Duplicates closed' },
    {
      id: 'saveSession',
      label: (arg) => (arg ? `Save session ${quote(arg)}` : 'Save session (this window)'),
      keywords: 'save window session',
      phrases: ['save session', 'save window', 'save'],
      request: (name) => ({ type: 'saveSession', kind: 'window', windowId, name }),
      done: 'Session saved',
    },
  ];
  if (here.length > 0) {
    cmds.push(
      { id: 'collapseAll', label: () => 'Collapse all groups', keywords: 'collapse all', request: () => ({ type: 'collapseAll', windowId, collapsed: true }), done: 'Collapsed' },
      { id: 'expandAll', label: () => 'Expand all groups', keywords: 'expand all', request: () => ({ type: 'collapseAll', windowId, collapsed: false }), done: 'Expanded' },
      { id: 'ungroupAll', label: () => 'Ungroup all', keywords: 'ungroup all groups', request: () => ({ type: 'ungroupAll', windowId }), done: 'Ungrouped' },
      {
        id: 'closeAllGroups',
        label: () => 'Close all groups',
        keywords: 'close all groups',
        request: () => ({ type: 'closeAllGroups', windowId }),
        done: 'Groups closed',
        confirm: `Close ${here.length} group${here.length === 1 ? '' : 's'}? Press Enter again`,
      },
    );
    for (const [key, by] of Object.entries(GROUP_SORT_LABELS) as Array<[GroupSortKey, string]>) {
      cmds.push({ id: `sortGroups:${key}`, label: () => `Sort groups ${by.toLowerCase()}`, keywords: 'sort order groups', request: () => ({ type: 'sortGroups', windowId, key }), done: 'Groups sorted' });
    }
  }
  for (const g of [...here, ...others]) {
    const name = quote(g.title);
    const where = g.windowId === currentWindowId ? '' : ' (other window)';
    const groupId = g.id;
    cmds.push(
      { id: `closeGroup:${groupId}`, label: () => `Close group ${name}${where}`, request: () => ({ type: 'closeGroup', groupId }), done: 'Group closed' },
      { id: `ungroup:${groupId}`, label: () => `Ungroup ${name}${where}`, request: () => ({ type: 'ungroup', groupId }), done: 'Ungrouped' },
      { id: `move:${groupId}`, label: () => `Move ${name} to new window${where}`, request: () => ({ type: 'moveGroupToNewWindow', groupId }), done: 'Moved to new window' },
      g.collapsed
        ? { id: `expand:${groupId}`, label: () => `Expand group ${name}${where}`, request: () => ({ type: 'setCollapsed', groupId, collapsed: false }), done: 'Expanded' }
        : { id: `collapse:${groupId}`, label: () => `Collapse group ${name}${where}`, request: () => ({ type: 'setCollapsed', groupId, collapsed: true }), done: 'Collapsed' },
      ...(Object.entries(TAB_SORT_LABELS) as Array<[TabSortKey, string]>).map(([key, by]): PaletteCommand => ({
        id: `sortTabs:${groupId}:${key}`,
        label: () => `Sort tabs in ${name} ${by.toLowerCase()}${where}`,
        keywords: 'sort order tabs',
        request: () => ({ type: 'sortGroupTabs', groupId, key }),
        done: 'Sorted',
      })),
    );
  }
  return cmds;
}

/**
 * If `query` starts with one of the command's phrases (case-insensitive, on a word boundary),
 * returns the remainder as the argument; otherwise null. Longer phrases win.
 */
export function parseArg(command: PaletteCommand, query: string): string | null {
  const q = query.trim().replace(/\s+/g, ' ');
  const lower = q.toLowerCase();
  const phrases = [...(command.phrases ?? [])].sort((a, b) => b.length - a.length);
  for (const p of phrases) {
    if (lower === p) return '';
    if (lower.startsWith(`${p} `)) return q.slice(p.length + 1).trim();
  }
  return null;
}

/** Fuzzy-matches the palette query against commands, best first. Arguments are parsed out. */
export function searchCommands(query: string, commands: PaletteCommand[], limit = 30): PaletteMatch[] {
  const q = query.trim();
  if (!q) return commands.slice(0, limit).map((command) => ({ command, arg: '', label: command.label('') }));
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: Array<PaletteMatch & { score: number; order: number }> = [];
  commands.forEach((command, order) => {
    const arg = parseArg(command, q);
    if (arg !== null) {
      scored.push({ command, arg, label: command.label(arg), score: 100000, order });
      return;
    }
    const label = command.label('');
    let total = 0;
    for (const term of terms) {
      const s = Math.max(fuzzyScore(term, label) * 1.2, fuzzyScore(term, command.keywords ?? ''));
      if (s === 0) {
        total = 0;
        break;
      }
      total += s;
    }
    if (total > 0) scored.push({ command, arg: '', label, score: total, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map(({ command, arg, label }) => ({ command, arg, label }));
}
