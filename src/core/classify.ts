import type { GroupColor } from '@/shared/types';

export interface Category {
  name: string;
  color: GroupColor;
}

interface CategoryDef extends Category {
  keywords: string[];
  /** Keywords that count double, usually unambiguous. */
  strong?: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Dev', color: 'blue',
    keywords: ['github', 'gitlab', 'pull request', 'merge request', 'commit', 'repository', 'repo', 'stack overflow',
      'stackoverflow', 'npm', 'typescript', 'javascript', 'python', 'rust', 'golang', 'docker', 'kubernetes',
      'api reference', 'sdk', 'compiler', 'debug', 'localhost', 'issue #', 'changelog', 'release notes'],
    strong: ['pull request', 'merge request', 'stack overflow', 'localhost'],
  },
  {
    name: 'Docs', color: 'cyan',
    keywords: ['documentation', 'docs', 'reference', 'guide', 'tutorial', 'manual', 'how to', 'getting started',
      'readme', 'wiki', 'mdn', 'specification', 'rfc'],
    strong: ['documentation', 'getting started'],
  },
  {
    name: 'Social', color: 'pink',
    keywords: ['twitter', 'tweet', 'reddit', 'r/', 'facebook', 'instagram', 'linkedin', 'mastodon', 'bluesky',
      'threads', 'tiktok', 'timeline', 'feed', 'post by', 'comments'],
    strong: ['tweet', 'reddit', 'instagram'],
  },
  {
    name: 'Video', color: 'red',
    keywords: ['youtube', 'video', 'watch', 'stream', 'episode', 'season', 'trailer', 'twitch', 'netflix',
      'movie', 'film', 'vimeo', 'playlist'],
    strong: ['youtube', 'netflix', 'twitch', 'trailer'],
  },
  {
    name: 'Shopping', color: 'yellow',
    keywords: ['amazon', 'cart', 'checkout', 'buy', 'price', 'shop', 'store', 'order', 'deal', 'sale', 'free shipping',
      'add to cart', 'ebay', 'etsy', 'product', 'review'],
    strong: ['add to cart', 'checkout', 'free shipping'],
  },
  {
    name: 'Mail', color: 'green',
    keywords: ['inbox', 'gmail', 'outlook', 'mail', 'calendar', 'meeting', 'invite', 'unread', 'compose'],
    strong: ['inbox', 'gmail', 'calendar'],
  },
  {
    name: 'News', color: 'orange',
    keywords: ['news', 'breaking', 'report', 'headline', 'politics', 'election', 'economy', 'world', 'opinion',
      'analysis', 'reuters', 'bbc', 'nyt', 'guardian', 'bloomberg'],
    strong: ['breaking', 'reuters', 'bbc', 'bloomberg'],
  },
  {
    name: 'Finance', color: 'purple',
    keywords: ['bank', 'invest', 'stock', 'portfolio', 'crypto', 'bitcoin', 'ticker', 'nasdaq', 'etf', 'mortgage',
      'budget', 'invoice', 'tax', 'payment', 'wallet'],
    strong: ['portfolio', 'nasdaq', 'invoice', 'mortgage'],
  },
  {
    name: 'Research', color: 'grey',
    keywords: ['paper', 'arxiv', 'journal', 'study', 'abstract', 'doi', 'research', 'thesis', 'pdf', 'wikipedia',
      'encyclopedia', 'citation'],
    strong: ['arxiv', 'doi', 'wikipedia'],
  },
];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const compiled = CATEGORIES.map((c) => ({
  ...c,
  tests: c.keywords.map((k) => ({
    weight: c.strong?.includes(k) ? 2 : 1,
    re: new RegExp(`(^|[^a-z0-9])${escapeRegex(k.toLowerCase())}([^a-z0-9]|$)`, 'i'),
  })),
}));

/**
 * Local keyword heuristic: scores the title, meta description and URL path against each category.
 * Returns null when nothing matches. No network calls.
 */
export function classify(title: string, description?: string, url?: string): Category | null {
  const text = [title, description ?? '', url ?? ''].join(' \n ').toLowerCase();
  if (!text.trim()) return null;
  let best: { score: number; cat: Category } | null = null;
  for (const c of compiled) {
    let score = 0;
    for (const t of c.tests) if (t.re.test(text)) score += t.weight;
    if (score > 0 && (!best || score > best.score)) best = { score, cat: { name: c.name, color: c.color } };
  }
  return best?.cat ?? null;
}

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);
