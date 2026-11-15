import type { Assignment, Rule, Settings } from '@/shared/types';
import { baseDomain, hostname, isGroupableUrl, matchesDomain } from './url';
import { globMatches } from './glob';
import { colorForName } from './colors';
import { classify } from './classify';

export interface RuleInput {
  url: string;
  title: string;
  /** Optional meta description, only available when the content script is enabled. */
  description?: string;
}

const regexCache = new Map<string, RegExp | null>();

function compileRegex(pattern: string): RegExp | null {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) return cached;
  let re: RegExp | null;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    re = null;
  }
  regexCache.set(pattern, re);
  return re;
}

/** Does a single rule match the given tab? Disabled rules never match. */
export function matchRule(rule: Rule, input: RuleInput): boolean {
  if (!rule.enabled || !rule.pattern.trim()) return false;
  switch (rule.matchType) {
    case 'domain': {
      const host = hostname(input.url);
      return host !== null && matchesDomain(host, rule.pattern);
    }
    case 'glob':
      return globMatches(rule.pattern, input.url);
    case 'regex': {
      const re = compileRegex(rule.pattern);
      return re !== null && re.test(input.url);
    }
    case 'title': {
      const title = input.title.toLowerCase();
      return rule.pattern
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .some((k) => title.includes(k));
    }
    default:
      return false;
  }
}

/** Validates a rule pattern; returns an error message or null. */
export function validatePattern(matchType: Rule['matchType'], pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Pattern is empty';
  if (matchType === 'regex') {
    try {
      new RegExp(p, 'i');
    } catch (e) {
      return `Invalid regex: ${(e as Error).message}`;
    }
  }
  if (matchType === 'domain' && /[/:?#\s]/.test(p.replace(/^\*\./, ''))) {
    return 'Domain should look like "example.com" (no scheme or path)';
  }
  return null;
}

/** Returns the first matching enabled rule, honouring the array order as priority. */
export function findMatchingRule(rules: Rule[], input: RuleInput): Rule | undefined {
  return rules.find((r) => matchRule(r, input));
}

export function resolveColor(color: Rule['color'], name: string) {
  return color === 'auto' ? colorForName(name) : color;
}

/**
 * The rule engine: url + title in, group assignment out.
 * Order: user rules (by priority) -> content classification (if enabled) -> domain (if enabled) -> null.
 */
export function assignGroup(input: RuleInput, settings: Settings): Assignment | null {
  if (!isGroupableUrl(input.url)) return null;
  const rule = findMatchingRule(settings.rules, input);
  if (rule) {
    return { name: rule.name, color: resolveColor(rule.color, rule.name), ruleId: rule.id, source: 'rule' };
  }
  if (settings.contentGrouping) {
    const category = classify(input.title, input.description, input.url);
    if (category) return { name: category.name, color: category.color, source: 'content' };
  }
  if (settings.groupByDomain) {
    const host = hostname(input.url);
    if (!host) return null;
    const name = settings.mergeSubdomains ? baseDomain(host) : host;
    return { name, color: colorForName(name), source: 'domain' };
  }
  return null;
}
