import { describe, expect, it } from 'vitest';
import { globMatches, globToRegExp } from '@/core/glob';

describe('globMatches', () => {
  it('matches Chrome-style patterns with optional subdomains', () => {
    const g = '*://*.github.com/*';
    expect(globMatches(g, 'https://github.com/')).toBe(true);
    expect(globMatches(g, 'https://docs.github.com/en/actions')).toBe(true);
    expect(globMatches(g, 'https://github.com.evil.com/')).toBe(false);
    expect(globMatches(g, 'https://notgithub.com/')).toBe(false);
  });
  it('treats an omitted scheme as any scheme and an omitted path as any path', () => {
    expect(globMatches('github.com', 'https://github.com/foo/bar')).toBe(true);
    expect(globMatches('github.com', 'http://github.com')).toBe(true);
    expect(globMatches('github.com/pulls*', 'https://github.com/pulls?q=1')).toBe(true);
    expect(globMatches('github.com/pulls*', 'https://github.com/issues')).toBe(false);
  });
  it('supports wildcards in the host', () => {
    expect(globMatches('*://docs.*/*', 'https://docs.python.org/3/')).toBe(true);
    expect(globMatches('*://docs.*/*', 'https://python.org/docs/')).toBe(false);
    expect(globMatches('*://*.amazon.*/*', 'https://www.amazon.co.uk/dp/1')).toBe(true);
    expect(globMatches('*://*.amazon.*/*', 'https://amazon.com/')).toBe(true);
  });
  it('matches localhost with any port', () => {
    expect(globMatches('*://localhost*/*', 'http://localhost:3000/app')).toBe(true);
    expect(globMatches('*://localhost*/*', 'http://localhost/')).toBe(true);
  });
  it('respects a fixed scheme and is case-insensitive', () => {
    expect(globMatches('https://a.com/*', 'http://a.com/')).toBe(false);
    expect(globMatches('https://a.com/*', 'HTTPS://A.COM/x')).toBe(true);
  });
  it('returns null for an empty glob', () => {
    expect(globToRegExp('')).toBeNull();
    expect(globMatches('   ', 'https://a.com')).toBe(false);
  });
});
