import { describe, expect, it } from 'vitest';
import { classify } from '@/core/classify';

describe('classify', () => {
  it('picks categories from titles', () => {
    expect(classify('Fix flaky test by octocat · Pull Request #12 · org/repo')?.name).toBe('Dev');
    expect(classify('Official Trailer - YouTube')?.name).toBe('Video');
    expect(classify('Inbox (3) - someone@gmail.com - Gmail')?.name).toBe('Mail');
    expect(classify('Your Shopping Cart - Checkout')?.name).toBe('Shopping');
  });
  it('uses the meta description and url when present', () => {
    expect(classify('Untitled', 'Breaking news from Reuters on the election')?.name).toBe('News');
    expect(classify('Paper', undefined, 'https://arxiv.org/abs/1234')?.name).toBe('Research');
  });
  it('returns null when nothing matches', () => {
    expect(classify('zzz qqq')).toBeNull();
    expect(classify('')).toBeNull();
  });
});
