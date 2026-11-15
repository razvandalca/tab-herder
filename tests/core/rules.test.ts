import { describe, expect, it } from 'vitest';
import { assignGroup, findMatchingRule, matchRule, validatePattern } from '@/core/rules';
import { colorForName } from '@/core/colors';
import { PRESETS, rulesFromPreset } from '@/shared/presets';
import { rule, settings } from './helpers';

const gh = { url: 'https://docs.github.com/en', title: 'GitHub Docs' };

describe('matchRule', () => {
  it('matches domain rules including subdomains', () => {
    expect(matchRule(rule({ name: 'Dev', pattern: 'github.com' }), gh)).toBe(true);
    expect(matchRule(rule({ name: 'Dev', pattern: 'hub.com' }), gh)).toBe(false);
  });
  it('matches glob, regex and title rules', () => {
    expect(matchRule(rule({ name: 'x', matchType: 'glob', pattern: '*://*.github.com/*' }), gh)).toBe(true);
    expect(matchRule(rule({ name: 'x', matchType: 'regex', pattern: 'github\\.com/en' }), gh)).toBe(true);
    expect(matchRule(rule({ name: 'x', matchType: 'regex', pattern: 'gitlab' }), gh)).toBe(false);
    expect(matchRule(rule({ name: 'x', matchType: 'title', pattern: 'docs' }), gh)).toBe(true);
    expect(matchRule(rule({ name: 'x', matchType: 'title', pattern: 'foo, DOCS' }), gh)).toBe(true);
    expect(matchRule(rule({ name: 'x', matchType: 'title', pattern: 'foo' }), gh)).toBe(false);
  });
  it('never matches disabled rules, empty patterns or invalid regexes', () => {
    expect(matchRule(rule({ name: 'x', pattern: 'github.com', enabled: false }), gh)).toBe(false);
    expect(matchRule(rule({ name: 'x', pattern: '   ' }), gh)).toBe(false);
    expect(matchRule(rule({ name: 'x', matchType: 'regex', pattern: '(' }), gh)).toBe(false);
  });
});

describe('validatePattern', () => {
  it('flags empty, bad regex and domain-with-path', () => {
    expect(validatePattern('domain', '')).toMatch(/empty/i);
    expect(validatePattern('regex', '[')).toMatch(/invalid regex/i);
    expect(validatePattern('domain', 'https://a.com/x')).toMatch(/domain/i);
    expect(validatePattern('domain', 'a.com')).toBeNull();
    expect(validatePattern('glob', '*://a.com/*')).toBeNull();
  });
});

describe('findMatchingRule / priority', () => {
  it('returns the first matching rule in array order', () => {
    const rules = [
      rule({ name: 'Second', pattern: 'github.com', enabled: false }),
      rule({ name: 'First', matchType: 'title', pattern: 'docs' }),
      rule({ name: 'Third', pattern: 'github.com' }),
    ];
    expect(findMatchingRule(rules, gh)?.name).toBe('First');
  });
});

describe('assignGroup', () => {
  it('prefers rules over domain fallback and resolves auto colours', () => {
    const s = settings({ rules: [rule({ name: 'Dev', pattern: 'github.com', color: 'blue' })] });
    expect(assignGroup(gh, s)).toMatchObject({ name: 'Dev', color: 'blue', source: 'rule' });
    const auto = settings({ rules: [rule({ name: 'Dev', pattern: 'github.com', color: 'auto' })] });
    expect(assignGroup(gh, auto)?.color).toBe(colorForName('Dev'));
  });
  it('falls back to merged domain by default', () => {
    expect(assignGroup(gh, settings())).toMatchObject({ name: 'github.com', source: 'domain' });
  });
  it('uses the full hostname when mergeSubdomains is off', () => {
    expect(assignGroup(gh, settings({ mergeSubdomains: false }))?.name).toBe('docs.github.com');
  });
  it('returns null for internal pages and when domain grouping is off', () => {
    expect(assignGroup({ url: 'chrome://newtab', title: 'New tab' }, settings())).toBeNull();
    expect(assignGroup(gh, settings({ groupByDomain: false }))).toBeNull();
  });
  it('uses content classification before the domain fallback when enabled', () => {
    const s = settings({ contentGrouping: true });
    expect(assignGroup({ url: 'https://example.com/x', title: 'Watch: Official Trailer' }, s)).toMatchObject({
      name: 'Video',
      source: 'content',
    });
    expect(assignGroup({ url: 'https://example.com/x', title: 'zzz qqq' }, s)).toMatchObject({ source: 'domain' });
  });
});

describe('presets', () => {
  it('expand into enabled rules tagged with their preset id', () => {
    const dev = PRESETS.find((p) => p.id === 'dev')!;
    const rules = rulesFromPreset(dev);
    expect(rules.length).toBe(dev.matches.length);
    expect(rules.every((r) => r.enabled && r.presetId === 'dev' && r.name === 'Dev')).toBe(true);
    const s = settings({ rules });
    expect(assignGroup({ url: 'https://stackoverflow.com/q/1', title: '' }, s)?.name).toBe('Dev');
    expect(assignGroup({ url: 'http://localhost:5173/', title: '' }, s)?.name).toBe('Dev');
  });
  it('cloud consoles win over generic domains when placed first', () => {
    const cloud = rulesFromPreset(PRESETS.find((p) => p.id === 'cloud')!);
    const shopping = rulesFromPreset(PRESETS.find((p) => p.id === 'shopping')!);
    const s = settings({ rules: [...cloud, ...shopping] });
    expect(assignGroup({ url: 'https://console.aws.amazon.com/ec2', title: '' }, s)?.name).toBe('Cloud');
    expect(assignGroup({ url: 'https://www.amazon.com/dp/1', title: '' }, s)?.name).toBe('Shopping');
  });
});
