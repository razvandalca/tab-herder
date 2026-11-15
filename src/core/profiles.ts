import type { Rule, RuleProfile, Settings } from '@/shared/types';

/*
 * Rule profiles: several named rule sets, one of them active.
 *
 * chrome.storage.sync layout (8 KB per item, 100 KB in total):
 *   settings              Settings without rules/profiles/activeProfileId (shared by all profiles)
 *   rules                 Rule[] of the ACTIVE profile (unchanged from before profiles existed,
 *                         so existing installs need no data migration)
 *   profiles              ProfileIndex: { activeId, list: [{ id, name, chunks }] }
 *   rules:<id>:<n>        Rule[] chunk n of an INACTIVE profile, each chunk under the per-item quota
 *
 * Installs from before profiles have no `profiles` key; their `rules` become the "Default" profile.
 */

export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PROFILE_NAME = 'Default';
export const CHUNK_PREFIX = 'rules:';
/** chrome.storage.sync.QUOTA_BYTES_PER_ITEM is 8192 (key + JSON value); keep headroom for the key. */
export const CHUNK_MAX_BYTES = 7900;

export interface ProfileIndexEntry {
  id: string;
  name: string;
  /** Number of `rules:<id>:<n>` chunks holding this profile's rules (0 for the active profile). */
  chunks: number;
}

export interface ProfileIndex {
  activeId: string;
  list: ProfileIndexEntry[];
}

export interface ProfileState {
  rules: Rule[];
  profiles: RuleProfile[];
  activeProfileId: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const byteLength = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

export const chunkKey = (profileId: string, n: number) => `${CHUNK_PREFIX}${profileId}:${n}`;

/** Splits rules into consecutive chunks whose JSON stays under `maxBytes` (an oversized rule gets its own chunk). */
export function chunkRules(rules: Rule[], maxBytes = CHUNK_MAX_BYTES): Rule[][] {
  const chunks: Rule[][] = [];
  let current: Rule[] = [];
  let size = 2; // "[]"
  for (const rule of rules) {
    const s = byteLength(rule);
    if (current.length && size + 1 + s > maxBytes) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    size += s + (current.length ? 1 : 0); // +1 for the separating comma
    current.push(rule);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Reads profiles out of a raw `chrome.storage.sync.get(null)` result, migrating pre-profile data. */
export function decodeProfiles(raw: Record<string, unknown>): ProfileState {
  const rules = Array.isArray(raw.rules) ? (raw.rules as Rule[]) : [];
  const index = raw.profiles;
  const list =
    isObject(index) && Array.isArray(index.list)
      ? (index.list as unknown[]).filter(
          (e): e is ProfileIndexEntry =>
            isObject(e) && typeof e.id === 'string' && e.id !== '' && typeof e.name === 'string',
        )
      : [];
  if (!list.length) {
    return {
      rules,
      profiles: [{ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, rules }],
      activeProfileId: DEFAULT_PROFILE_ID,
    };
  }
  const wanted = isObject(index) && typeof index.activeId === 'string' ? index.activeId : '';
  const activeProfileId = list.some((e) => e.id === wanted) ? wanted : list[0]!.id;
  const seen = new Set<string>();
  const profiles: RuleProfile[] = [];
  for (const e of list) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.id === activeProfileId) {
      profiles.push({ id: e.id, name: e.name, rules });
      continue;
    }
    const out: Rule[] = [];
    const chunks = typeof e.chunks === 'number' ? e.chunks : 0;
    for (let n = 0; n < chunks; n++) {
      const part = raw[chunkKey(e.id, n)];
      if (Array.isArray(part)) out.push(...(part as Rule[]));
    }
    profiles.push({ id: e.id, name: e.name, rules: out });
  }
  return { rules, profiles, activeProfileId };
}

/** Makes `settings.profiles` consistent: active profile exists and mirrors `settings.rules`. */
export function normalizeProfiles(settings: Settings): Settings {
  let profiles = Array.isArray(settings.profiles) ? settings.profiles.filter((p) => p && typeof p.id === 'string') : [];
  if (!profiles.length) profiles = [{ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, rules: settings.rules }];
  const activeProfileId = profiles.some((p) => p.id === settings.activeProfileId)
    ? settings.activeProfileId
    : profiles[0]!.id;
  return {
    ...settings,
    activeProfileId,
    profiles: profiles.map((p) => (p.id === activeProfileId ? { ...p, rules: settings.rules } : p)),
  };
}

/** Everything that goes into chrome.storage.sync for these settings, plus stale chunk keys to remove. */
export function encodeSync(
  settings: Settings,
  existingKeys: string[] = [],
): { items: Record<string, unknown>; remove: string[] } {
  const s = normalizeProfiles(settings);
  const { rules, profiles, activeProfileId, ...rest } = s;
  const items: Record<string, unknown> = { settings: rest, rules };
  const list: ProfileIndexEntry[] = [];
  for (const p of profiles) {
    if (p.id === activeProfileId) {
      list.push({ id: p.id, name: p.name, chunks: 0 });
      continue;
    }
    const chunks = chunkRules(p.rules);
    chunks.forEach((c, n) => {
      items[chunkKey(p.id, n)] = c;
    });
    list.push({ id: p.id, name: p.name, chunks: chunks.length });
  }
  items.profiles = { activeId: activeProfileId, list } satisfies ProfileIndex;
  const remove = existingKeys.filter((k) => k.startsWith(CHUNK_PREFIX) && !(k in items));
  return { items, remove };
}

// ---------- profile operations (pure; return new Settings) ----------

export function profileRules(settings: Settings, id: string): Rule[] {
  if (id === settings.activeProfileId) return settings.rules;
  return settings.profiles.find((p) => p.id === id)?.rules ?? [];
}

export function setProfileRules(settings: Settings, id: string, rules: Rule[]): Settings {
  const s = normalizeProfiles(settings);
  if (!s.profiles.some((p) => p.id === id)) return s;
  return normalizeProfiles({
    ...s,
    rules: id === s.activeProfileId ? rules : s.rules,
    profiles: s.profiles.map((p) => (p.id === id ? { ...p, rules } : p)),
  });
}

/** Makes another profile active. Does not regroup anything; that is up to the caller/user. */
export function switchProfile(settings: Settings, id: string): Settings {
  const s = normalizeProfiles(settings);
  const target = s.profiles.find((p) => p.id === id);
  if (!target || id === s.activeProfileId) return s;
  return { ...s, activeProfileId: id, rules: target.rules };
}

/** A name not already used by another profile ("Work", "Work 2", …). */
export function uniqueProfileName(settings: Settings, wanted: string, exceptId?: string): string {
  const base = wanted.trim() || 'Profile';
  const taken = new Set(settings.profiles.filter((p) => p.id !== exceptId).map((p) => p.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

export function createProfile(settings: Settings, name: string, id: string, rules: Rule[] = []): Settings {
  const s = normalizeProfiles(settings);
  if (s.profiles.some((p) => p.id === id)) return s;
  return { ...s, profiles: [...s.profiles, { id, name: uniqueProfileName(s, name), rules }] };
}

export function renameProfile(settings: Settings, id: string, name: string): Settings {
  const s = normalizeProfiles(settings);
  if (!name.trim()) return s;
  return { ...s, profiles: s.profiles.map((p) => (p.id === id ? { ...p, name: uniqueProfileName(s, name, id) } : p)) };
}

/** Copies a profile's rules (with fresh rule ids) into a new profile. */
export function duplicateProfile(
  settings: Settings,
  id: string,
  newProfileId: string,
  newRuleId: () => string,
): Settings {
  const s = normalizeProfiles(settings);
  const src = s.profiles.find((p) => p.id === id);
  if (!src) return s;
  return createProfile(
    s,
    `${src.name} copy`,
    newProfileId,
    src.rules.map((r) => ({ ...r, id: newRuleId() })),
  );
}

/** Deletes a profile; the last one cannot be deleted. Deleting the active one activates the first remaining. */
export function deleteProfile(settings: Settings, id: string): Settings {
  const s = normalizeProfiles(settings);
  if (s.profiles.length <= 1 || !s.profiles.some((p) => p.id === id)) return s;
  const profiles = s.profiles.filter((p) => p.id !== id);
  if (id !== s.activeProfileId) return { ...s, profiles };
  const next = profiles[0]!;
  return { ...s, profiles, activeProfileId: next.id, rules: next.rules };
}

// ---------- import ----------

function isRule(r: unknown): r is Rule {
  if (!isObject(r)) return false;
  return typeof r.name === 'string' && typeof r.pattern === 'string' && typeof r.matchType === 'string';
}

export function sanitizeRules(rules: unknown, newRuleId: () => string): Rule[] {
  return (Array.isArray(rules) ? rules : []).filter(isRule).map((r) => ({
    ...r,
    id: r.id || newRuleId(),
    enabled: r.enabled !== false,
    color: r.color ?? 'auto',
  }));
}

function appendRules(current: Rule[], incoming: Rule[]): Rule[] {
  const ids = new Set(current.map((r) => r.id));
  return [...current, ...incoming.filter((r) => !ids.has(r.id))];
}

/**
 * Applies the `settings` part of an export file (version 1 or 2) to the current settings.
 * - v1 (or v2 without profiles): the file's rules go into the active profile.
 * - v2 with profiles: replace = take the file's profiles and active profile;
 *   append = add new profiles and append missing rules (by id) to profiles with the same id.
 * Other settings in the file overwrite the current ones (`incoming` must already have defaults applied).
 */
export function mergeImportedSettings(
  current: Settings,
  incoming: Settings,
  file: { version: number; settings: Record<string, unknown> },
  mode: 'replace' | 'append',
  newRuleId: () => string,
): { settings: Settings; rules: number } {
  const base = normalizeProfiles(current);
  const { rules: _r, profiles: _p, activeProfileId: _a, ...rest } = incoming;
  const fileProfiles =
    file.version >= 2 && Array.isArray(file.settings.profiles)
      ? (file.settings.profiles as unknown[])
          .filter(
            (p): p is Record<string, unknown> =>
              isObject(p) && typeof p.id === 'string' && p.id !== '' && typeof p.name === 'string',
          )
          .map((p) => ({ id: p.id as string, name: p.name as string, rules: sanitizeRules(p.rules, newRuleId) }))
      : [];

  if (!fileProfiles.length) {
    const rules = sanitizeRules(file.settings.rules, newRuleId);
    const merged = mode === 'replace' ? rules : appendRules(base.rules, rules);
    return { settings: normalizeProfiles({ ...base, ...rest, rules: merged }), rules: rules.length };
  }

  // The file's active profile's rules live in `settings.rules` too; prefer that copy.
  const fileActive = typeof file.settings.activeProfileId === 'string' ? file.settings.activeProfileId : '';
  if (fileProfiles.some((p) => p.id === fileActive) && Array.isArray(file.settings.rules)) {
    const activeRules = sanitizeRules(file.settings.rules, newRuleId);
    for (const p of fileProfiles) if (p.id === fileActive) p.rules = activeRules;
  }
  const count = fileProfiles.reduce((n, p) => n + p.rules.length, 0);

  if (mode === 'replace') {
    const active = fileProfiles.find((p) => p.id === fileActive) ?? fileProfiles[0]!;
    return {
      settings: normalizeProfiles({
        ...base,
        ...rest,
        profiles: fileProfiles,
        activeProfileId: active.id,
        rules: active.rules,
      }),
      rules: count,
    };
  }

  const profiles = base.profiles.map((p) => {
    const match = fileProfiles.find((f) => f.id === p.id);
    return match ? { ...p, rules: appendRules(p.rules, match.rules) } : p;
  });
  for (const f of fileProfiles) {
    if (!profiles.some((p) => p.id === f.id))
      profiles.push({ ...f, name: uniqueProfileName({ ...base, profiles }, f.name) });
  }
  const activeRules = profiles.find((p) => p.id === base.activeProfileId)!.rules;
  return { settings: normalizeProfiles({ ...base, ...rest, profiles, rules: activeRules }), rules: count };
}
