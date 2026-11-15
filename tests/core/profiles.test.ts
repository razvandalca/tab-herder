import { describe, expect, it } from 'vitest';
import {
  CHUNK_MAX_BYTES,
  chunkKey,
  chunkRules,
  createProfile,
  decodeProfiles,
  deleteProfile,
  duplicateProfile,
  encodeSync,
  mergeImportedSettings,
  normalizeProfiles,
  profileRules,
  renameProfile,
  sanitizeRules,
  setProfileRules,
  switchProfile,
  uniqueProfileName,
} from '@/core/profiles';
import { DEFAULT_SETTINGS } from '@/shared/defaults';
import { withDefaults } from '@/shared/storage';
import type { Rule, Settings } from '@/shared/types';
import { rule, settings } from './helpers';

const dev = rule({ id: 'dev', name: 'Dev', pattern: 'github.com' });
const mail = rule({ id: 'mail', name: 'Mail', pattern: 'mail.google.com' });
const news = rule({ id: 'news', name: 'News', pattern: 'news.ycombinator.com' });

let counter = 0;
const ids = () => `id${++counter}`;

/** Simulates a chrome.storage.sync round trip: encode, then decode the stored items. */
function roundTrip(
  s: Settings,
  existing: Record<string, unknown> = {},
): { stored: Record<string, unknown>; back: Settings } {
  const { items, remove } = encodeSync(s, Object.keys(existing));
  const stored = { ...existing, ...items };
  for (const k of remove) delete stored[k];
  const back = { ...withDefaults<Settings>(stored.settings, DEFAULT_SETTINGS), ...decodeProfiles(stored) };
  return { stored, back };
}

function twoProfiles(): Settings {
  return {
    ...settings({ rules: [dev] }),
    profiles: [
      { id: 'work', name: 'Work', rules: [dev] },
      { id: 'home', name: 'Personal', rules: [mail, news] },
    ],
    activeProfileId: 'work',
  };
}

describe('decodeProfiles (migration)', () => {
  it('turns pre-profile rules into a Default profile, losing nothing', () => {
    const raw = { settings: { mode: 'auto' }, rules: [dev, mail] };
    const out = decodeProfiles(raw);
    expect(out.activeProfileId).toBe('default');
    expect(out.rules).toEqual([dev, mail]);
    expect(out.profiles).toEqual([{ id: 'default', name: 'Default', rules: [dev, mail] }]);
  });

  it('handles a fresh install with nothing stored', () => {
    expect(decodeProfiles({})).toEqual({
      rules: [],
      profiles: [{ id: 'default', name: 'Default', rules: [] }],
      activeProfileId: 'default',
    });
  });

  it('ignores malformed index entries and duplicate ids, falls back to the first profile if active is unknown', () => {
    const raw = {
      rules: [dev],
      profiles: {
        activeId: 'gone',
        list: [
          { id: 'a', name: 'A', chunks: 0 },
          null,
          { id: '', name: 'x' },
          { id: 'b', name: 'B', chunks: 2 },
          { id: 'a', name: 'dup' },
        ],
      },
      [chunkKey('b', 0)]: [mail],
      // chunk 1 missing (e.g. not yet synced): skipped, not fatal
    };
    const out = decodeProfiles(raw);
    expect(out.activeProfileId).toBe('a');
    expect(out.profiles.map((p) => p.name)).toEqual(['A', 'B']);
    expect(out.profiles[0]!.rules).toEqual([dev]);
    expect(out.profiles[1]!.rules).toEqual([mail]);
  });

  it('treats an index without a usable list as pre-profile data', () => {
    expect(decodeProfiles({ rules: [dev], profiles: { activeId: 'x', list: 'nope' } }).profiles).toEqual([
      { id: 'default', name: 'Default', rules: [dev] },
    ]);
    expect(decodeProfiles({ rules: 'bad', profiles: { list: [{ id: 'p', name: 'P', chunks: 'x' }] } })).toEqual({
      rules: [],
      profiles: [{ id: 'p', name: 'P', rules: [] }],
      activeProfileId: 'p',
    });
  });
});

describe('encodeSync / storage layout', () => {
  it('keeps the active profile in `rules` and other profiles in chunk keys', () => {
    const { items } = encodeSync(twoProfiles());
    expect(items.rules).toEqual([dev]);
    expect(items.profiles).toEqual({
      activeId: 'work',
      list: [
        { id: 'work', name: 'Work', chunks: 0 },
        { id: 'home', name: 'Personal', chunks: 1 },
      ],
    });
    expect(items[chunkKey('home', 0)]).toEqual([mail, news]);
    expect(items.settings).not.toHaveProperty('rules');
    expect(items.settings).not.toHaveProperty('profiles');
    expect(items.settings).not.toHaveProperty('activeProfileId');
  });

  it('round-trips profiles and removes stale chunk keys', () => {
    const s = twoProfiles();
    const first = roundTrip(s);
    expect(first.back.profiles).toEqual(s.profiles);
    expect(first.back.rules).toEqual([dev]);
    // Switching makes "home" active: its chunk is no longer needed.
    const second = roundTrip(switchProfile(first.back, 'home'), first.stored);
    expect(second.stored).not.toHaveProperty(chunkKey('home', 0));
    expect(second.stored[chunkKey('work', 0)]).toEqual([dev]);
    expect(second.back.rules).toEqual([mail, news]);
    expect(second.back.activeProfileId).toBe('home');
  });

  it('migrates an old install on first save without losing rules', () => {
    const old = { settings: { mode: 'auto' }, rules: [dev, mail] };
    const s = { ...withDefaults<Settings>(old.settings, DEFAULT_SETTINGS), ...decodeProfiles(old) };
    const { stored, back } = roundTrip(s, old);
    expect(stored.rules).toEqual([dev, mail]);
    expect(back.mode).toBe('auto');
    expect(back.profiles).toEqual([{ id: 'default', name: 'Default', rules: [dev, mail] }]);
  });

  it('splits big profiles so every item fits the 8 KB sync quota', () => {
    const many: Rule[] = Array.from({ length: 300 }, (_, i) =>
      rule({
        id: `r${i}`,
        name: `Group ${i}`,
        matchType: 'regex',
        pattern: `^https://host-${i}\\.example\\.com/(a|b|c)/.*$`,
      }),
    );
    const s = createProfile(settings(), 'Big', 'big', many);
    const { items } = encodeSync(s);
    const index = items.profiles as { list: Array<{ id: string; chunks: number }> };
    const chunks = index.list.find((e) => e.id === 'big')!.chunks;
    expect(chunks).toBeGreaterThan(1);
    for (let n = 0; n < chunks; n++) {
      const key = chunkKey('big', n);
      expect(new TextEncoder().encode(JSON.stringify(items[key])).length + key.length).toBeLessThanOrEqual(8192);
    }
    expect(roundTrip(s).back.profiles.find((p) => p.id === 'big')!.rules).toEqual(many);
  });
});

describe('chunkRules', () => {
  it('returns no chunks for no rules and keeps order', () => {
    expect(chunkRules([])).toEqual([]);
    expect(chunkRules([dev, mail, news], 10_000)).toEqual([[dev, mail, news]]);
  });
  it('gives an oversized rule its own chunk', () => {
    const huge = rule({ id: 'huge', name: 'Huge', pattern: 'x'.repeat(CHUNK_MAX_BYTES) });
    expect(chunkRules([dev, huge, mail])).toEqual([[dev], [huge], [mail]]);
  });
});

describe('profile operations', () => {
  it('normalizes missing or inconsistent profile data', () => {
    const s = normalizeProfiles({ ...settings({ rules: [dev] }), profiles: [], activeProfileId: 'nope' });
    expect(s.profiles).toEqual([{ id: 'default', name: 'Default', rules: [dev] }]);
    const t = normalizeProfiles({ ...twoProfiles(), activeProfileId: 'missing' });
    expect(t.activeProfileId).toBe('work');
  });

  it('switches profiles, carrying the edited active rules back into their profile', () => {
    const s = { ...twoProfiles(), rules: [dev, news] }; // active rules edited via `rules`
    const next = switchProfile(s, 'home');
    expect(next.activeProfileId).toBe('home');
    expect(next.rules).toEqual([mail, news]);
    expect(next.profiles.find((p) => p.id === 'work')!.rules).toEqual([dev, news]);
    expect(switchProfile(next, 'home')).toEqual(next);
    expect(switchProfile(next, 'unknown').activeProfileId).toBe('home');
  });

  it('reads and writes rules of active and inactive profiles', () => {
    const s = twoProfiles();
    expect(profileRules(s, 'work')).toEqual([dev]);
    expect(profileRules(s, 'home')).toEqual([mail, news]);
    expect(profileRules(s, 'nope')).toEqual([]);
    const a = setProfileRules(s, 'home', [news]);
    expect(a.rules).toEqual([dev]);
    expect(profileRules(a, 'home')).toEqual([news]);
    const b = setProfileRules(s, 'work', [mail]);
    expect(b.rules).toEqual([mail]);
    expect(b.profiles[0]!.rules).toEqual([mail]);
    expect(setProfileRules(s, 'nope', [mail]).profiles).toEqual(s.profiles);
  });

  it('creates, renames, duplicates and deletes profiles', () => {
    let s = createProfile(twoProfiles(), 'Work', 'w2');
    expect(s.profiles.at(-1)).toEqual({ id: 'w2', name: 'Work 2', rules: [] });
    expect(createProfile(s, 'Again', 'w2').profiles).toHaveLength(3);
    s = renameProfile(s, 'w2', '  Side project ');
    expect(s.profiles.at(-1)!.name).toBe('Side project');
    expect(renameProfile(s, 'w2', '   ').profiles.at(-1)!.name).toBe('Side project');
    expect(renameProfile(s, 'w2', 'personal').profiles.at(-1)!.name).toBe('personal 2');

    s = duplicateProfile(s, 'home', 'h2', ids);
    const copy = s.profiles.find((p) => p.id === 'h2')!;
    expect(copy.name).toBe('Personal copy');
    expect(copy.rules.map((r) => r.pattern)).toEqual([mail.pattern, news.pattern]);
    expect(copy.rules.map((r) => r.id)).not.toContain('mail');
    expect(duplicateProfile(s, 'nope', 'x', ids).profiles).toHaveLength(s.profiles.length);

    s = deleteProfile(s, 'h2');
    expect(s.profiles.some((p) => p.id === 'h2')).toBe(false);
    s = deleteProfile(s, 'work'); // active -> first remaining becomes active
    expect(s.activeProfileId).toBe('home');
    expect(s.rules).toEqual([mail, news]);
    expect(deleteProfile(s, 'nope').profiles).toHaveLength(s.profiles.length);
    s = deleteProfile(s, 'w2');
    expect(deleteProfile(s, 'home').profiles).toHaveLength(1); // last one stays
  });

  it('builds unique names', () => {
    const s = twoProfiles();
    expect(uniqueProfileName(s, '')).toBe('Profile');
    expect(uniqueProfileName(s, 'work')).toBe('work 2');
    expect(uniqueProfileName(s, 'Work', 'work')).toBe('Work');
  });
});

describe('import (mergeImportedSettings)', () => {
  const apply = (
    current: Settings,
    file: { version: number; settings: Record<string, unknown> },
    mode: 'replace' | 'append',
  ) => mergeImportedSettings(current, withDefaults<Settings>(file.settings, DEFAULT_SETTINGS), file, mode, ids);

  it('sanitizes rules', () => {
    const out = sanitizeRules(
      [
        { name: 'A', pattern: 'a.com', matchType: 'domain' },
        { name: 1 },
        null,
        { id: 'k', name: 'B', pattern: 'b', matchType: 'title', enabled: false, color: 'red' },
      ],
      ids,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ enabled: true, color: 'auto' });
    expect(out[0]!.id).toBeTruthy();
    expect(out[1]).toMatchObject({ id: 'k', enabled: false, color: 'red' });
    expect(sanitizeRules(undefined, ids)).toEqual([]);
  });

  it('reads version 1 files into the active profile (append and replace)', () => {
    const v1 = { version: 1, settings: { mode: 'auto', rules: [news, dev] } };
    const appended = apply(twoProfiles(), v1, 'append');
    expect(appended.rules).toBe(2);
    expect(appended.settings.mode).toBe('auto');
    expect(appended.settings.rules.map((r) => r.id)).toEqual(['dev', 'news']);
    expect(profileRules(appended.settings, 'home').map((r) => r.id)).toEqual(['mail', 'news']); // untouched
    const replaced = apply(twoProfiles(), v1, 'replace');
    expect(replaced.settings.rules.map((r) => r.id)).toEqual(['news', 'dev']);
    expect(replaced.settings.profiles).toHaveLength(2);
    expect(replaced.settings.activeProfileId).toBe('work');
  });

  it('reads version 2 files with profiles (replace)', () => {
    const exported = normalizeProfiles(switchProfile(twoProfiles(), 'home'));
    const file = { version: 2, settings: JSON.parse(JSON.stringify(exported)) };
    const out = apply(settings({ rules: [news] }), file, 'replace');
    expect(out.rules).toBe(3);
    expect(out.settings.activeProfileId).toBe('home');
    expect(out.settings.rules.map((r) => r.id)).toEqual(['mail', 'news']);
    expect(out.settings.profiles.map((p) => p.name)).toEqual(['Work', 'Personal']);
  });

  it("prefers settings.rules for the file's active profile and falls back to the first profile", () => {
    const file = {
      version: 2,
      settings: { rules: [news], activeProfileId: 'work', profiles: [{ id: 'work', name: 'Work', rules: [dev] }] },
    };
    expect(apply(settings(), file, 'replace').settings.rules).toEqual([news]);
    const noActive = {
      version: 2,
      settings: { profiles: [{ id: 'x', name: 'X', rules: [dev] }, { id: 'y', name: 'Y' }, { bad: true }] },
    };
    const out = apply(settings(), noActive, 'replace');
    expect(out.settings.activeProfileId).toBe('x');
    expect(out.settings.profiles.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('reads version 2 files with profiles (append)', () => {
    const file = {
      version: 2,
      settings: {
        activeProfileId: 'home',
        rules: [news],
        profiles: [
          { id: 'home', name: 'Personal', rules: [news] },
          { id: 'fresh', name: 'Work', rules: [mail] },
        ],
      },
    };
    const current = {
      ...twoProfiles(),
      profiles: [
        { id: 'work', name: 'Work', rules: [dev] },
        { id: 'home', name: 'Personal', rules: [mail] },
      ],
    };
    const out = apply(current, file, 'append');
    expect(out.rules).toBe(2);
    expect(out.settings.activeProfileId).toBe('work');
    expect(out.settings.rules).toEqual([dev]);
    expect(profileRules(out.settings, 'home').map((r) => r.id)).toEqual(['mail', 'news']);
    expect(out.settings.profiles.find((p) => p.id === 'fresh')!.name).toBe('Work 2');
  });

  it('treats a version 2 file without profiles like version 1', () => {
    const out = apply(twoProfiles(), { version: 2, settings: { rules: [mail] } }, 'append');
    expect(out.settings.rules.map((r) => r.id)).toEqual(['dev', 'mail']);
  });
});
