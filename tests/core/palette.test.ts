import { describe, expect, it } from 'vitest';
import { buildCommands, paletteQuery, parseArg, searchCommands } from '@/core/palette';
import { group } from './helpers';

const groups = [
  group({ id: 10, title: 'Dev' }),
  group({ id: 11, title: 'Docs', collapsed: true }),
  group({ id: 12, title: '', windowId: 2 }),
];
const cmds = buildCommands(groups, 1);
const ids = (q: string) => searchCommands(q, cmds).map((m) => m.command.id);

describe('paletteQuery', () => {
  it('detects the > prefix and returns the rest', () => {
    expect(paletteQuery('> group now')).toBe('group now');
    expect(paletteQuery('  >collapse ')).toBe('collapse');
    expect(paletteQuery('>')).toBe('');
    expect(paletteQuery('github')).toBeNull();
    expect(paletteQuery('')).toBeNull();
  });
});

describe('buildCommands', () => {
  it('includes global commands and per-group commands', () => {
    const all = cmds.map((c) => c.id);
    expect(all).toEqual(expect.arrayContaining([
      'groupNow', 'cleanupNow', 'closeDuplicates', 'saveSession', 'collapseAll', 'expandAll', 'ungroupAll', 'closeAllGroups',
      'closeGroup:10', 'ungroup:10', 'move:10', 'collapse:10', 'expand:11', 'closeGroup:12',
    ]));
    expect(all).not.toContain('collapse:11');
  });
  it('omits window-wide group commands when the window has no groups', () => {
    const none = buildCommands([group({ id: 1, title: 'X', windowId: 5 })], 1).map((c) => c.id);
    expect(none).not.toContain('closeAllGroups');
    expect(none).not.toContain('collapseAll');
    expect(none).toContain('closeGroup:1');
  });
  it('builds the right requests', () => {
    const req = (id: string, arg = '') => cmds.find((c) => c.id === id)!.request(arg);
    expect(req('groupNow')).toEqual({ type: 'groupNow' });
    expect(req('cleanupNow')).toEqual({ type: 'cleanupNow' });
    expect(req('closeDuplicates')).toEqual({ type: 'closeDuplicates' });
    expect(req('saveSession', 'Research')).toEqual({ type: 'saveSession', kind: 'window', windowId: 1, name: 'Research' });
    expect(req('collapseAll')).toEqual({ type: 'collapseAll', windowId: 1, collapsed: true });
    expect(req('expandAll')).toEqual({ type: 'collapseAll', windowId: 1, collapsed: false });
    expect(req('ungroupAll')).toEqual({ type: 'ungroupAll', windowId: 1 });
    expect(req('closeAllGroups')).toEqual({ type: 'closeAllGroups', windowId: 1 });
    expect(req('closeGroup:10')).toEqual({ type: 'closeGroup', groupId: 10 });
    expect(req('ungroup:10')).toEqual({ type: 'ungroup', groupId: 10 });
    expect(req('move:10')).toEqual({ type: 'moveGroupToNewWindow', groupId: 10 });
    expect(req('collapse:10')).toEqual({ type: 'setCollapsed', groupId: 10, collapsed: true });
    expect(req('expand:11')).toEqual({ type: 'setCollapsed', groupId: 11, collapsed: false });
    expect(req('sortGroups:name')).toEqual({ type: 'sortGroups', windowId: 1, key: 'name' });
    expect(req('sortTabs:10:domain')).toEqual({ type: 'sortGroupTabs', groupId: 10, key: 'domain' });
  });
  it('marks only close-all as needing confirmation, with a count', () => {
    const confirming = cmds.filter((c) => c.confirm);
    expect(confirming.map((c) => c.id)).toEqual(['closeAllGroups']);
    expect(confirming[0]!.confirm).toMatch(/Close 2 groups\?/);
    const one = buildCommands([group({ id: 1, title: 'A' })], 1).find((c) => c.id === 'closeAllGroups')!;
    expect(one.confirm).toMatch(/Close 1 group\?/);
  });
  it('labels untitled groups and groups in other windows', () => {
    const label = (id: string) => cmds.find((c) => c.id === id)!.label('');
    expect(label('closeGroup:10')).toBe('Close group “Dev”');
    expect(label('closeGroup:12')).toBe('Close group “Untitled group” (other window)');
    expect(label('move:10')).toBe('Move “Dev” to new window');
  });
});

describe('parseArg', () => {
  const save = cmds.find((c) => c.id === 'saveSession')!;
  it('extracts the argument after the longest matching phrase, keeping case', () => {
    expect(parseArg(save, 'save session Research Notes')).toBe('Research Notes');
    expect(parseArg(save, 'SAVE   window  Foo')).toBe('Foo');
    expect(parseArg(save, 'save Foo')).toBe('Foo');
    expect(parseArg(save, 'save session')).toBe('');
  });
  it('returns null when the query does not start with a phrase', () => {
    expect(parseArg(save, 'saved')).toBeNull();
    expect(parseArg(save, 'session save')).toBeNull();
    expect(parseArg(cmds[0]!, 'group now')).toBeNull();
  });
});

describe('searchCommands', () => {
  it('lists commands in order for an empty query', () => {
    expect(ids('').slice(0, 3)).toEqual(['groupNow', 'cleanupNow', 'closeDuplicates']);
    expect(searchCommands('', cmds, 2)).toHaveLength(2);
  });
  it('fuzzy-matches the examples from the issue', () => {
    expect(ids('group now')[0]).toBe('groupNow');
    expect(ids('close duplicates')[0]).toBe('closeDuplicates');
    expect(ids('dupes')[0]).toBe('closeDuplicates');
    expect(ids('collapse all')[0]).toBe('collapseAll');
    expect(ids('close group Dev')[0]).toBe('closeGroup:10');
    expect(ids('move Dev to new window')[0]).toBe('move:10');
    expect(ids('expand docs')[0]).toBe('expand:11');
    expect(ids('sort groups by size')[0]).toBe('sortGroups:size');
    expect(ids('sort tabs dev domain')[0]).toBe('sortTabs:10:domain');
  });
  it('puts an argument command first and shows the argument in its label', () => {
    const [top] = searchCommands('save session Research', cmds);
    expect(top!.command.id).toBe('saveSession');
    expect(top!.arg).toBe('Research');
    expect(top!.label).toBe('Save session “Research”');
    expect(searchCommands('save', cmds)[0]!.label).toBe('Save session (this window)');
  });
  it('matches keywords and drops non-matches', () => {
    expect(ids('discard')).toContain('cleanupNow');
    expect(ids('zzzz')).toEqual([]);
  });
});
