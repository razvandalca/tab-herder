import { describe, expect, it } from 'vitest';
import { baseDomain, hostname, isGroupableUrl, matchesDomain, normalizeUrl } from '@/core/url';

describe('hostname', () => {
  it('lower-cases and strips www', () => {
    expect(hostname('https://WWW.GitHub.com/foo')).toBe('github.com');
  });
  it('returns null for non-URLs', () => {
    expect(hostname('not a url')).toBeNull();
    expect(hostname('')).toBeNull();
  });
});

describe('baseDomain', () => {
  it('collapses subdomains', () => {
    expect(baseDomain('docs.github.com')).toBe('github.com');
    expect(baseDomain('a.b.c.example.org')).toBe('example.org');
    expect(baseDomain('github.com')).toBe('github.com');
  });
  it('keeps multi-label public suffixes', () => {
    expect(baseDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(baseDomain('shop.example.com.au')).toBe('example.com.au');
    expect(baseDomain('user.github.io')).toBe('user.github.io');
  });
  it('leaves localhost and IPs alone', () => {
    expect(baseDomain('localhost')).toBe('localhost');
    expect(baseDomain('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('matchesDomain', () => {
  it('matches the domain and subdomains only', () => {
    expect(matchesDomain('github.com', 'github.com')).toBe(true);
    expect(matchesDomain('gist.github.com', 'github.com')).toBe(true);
    expect(matchesDomain('github.com.evil.com', 'github.com')).toBe(false);
    expect(matchesDomain('notgithub.com', 'github.com')).toBe(false);
  });
  it('accepts "*." and "www." prefixes in the pattern', () => {
    expect(matchesDomain('docs.github.com', '*.github.com')).toBe(true);
    expect(matchesDomain('github.com', 'www.github.com')).toBe(true);
    expect(matchesDomain('github.com', '')).toBe(false);
  });
});

describe('isGroupableUrl', () => {
  it('accepts http(s) and rejects internal pages', () => {
    expect(isGroupableUrl('https://a.com')).toBe(true);
    expect(isGroupableUrl('http://localhost:3000')).toBe(true);
    expect(isGroupableUrl('chrome://extensions')).toBe(false);
    expect(isGroupableUrl('chrome-extension://abc/popup.html')).toBe(false);
    expect(isGroupableUrl('about:blank')).toBe(false);
    expect(isGroupableUrl('file:///tmp/x.html')).toBe(false);
    expect(isGroupableUrl(undefined)).toBe(false);
    expect(isGroupableUrl('')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('strips the hash', () => {
    expect(normalizeUrl('https://a.com/page#section')).toBe('https://a.com/page');
  });
  it('removes tracking params and keeps the rest sorted', () => {
    expect(normalizeUrl('https://a.com/p?utm_source=x&b=2&a=1&fbclid=zzz&gclid=1')).toBe('https://a.com/p?a=1&b=2');
    expect(normalizeUrl('https://a.com/p?b=2&a=1')).toBe(normalizeUrl('https://a.com/p?a=1&b=2'));
  });
  it('lower-cases scheme and host, drops default ports and trailing slashes', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/Path/')).toBe('https://example.com/Path');
    expect(normalizeUrl('http://example.com:8080/')).toBe('http://example.com:8080/');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });
  it('treats utm-only query as no query', () => {
    expect(normalizeUrl('https://a.com/p?utm_campaign=c')).toBe('https://a.com/p');
  });
  it('returns the input unchanged for non-URLs', () => {
    expect(normalizeUrl('garbage')).toBe('garbage');
  });
});
