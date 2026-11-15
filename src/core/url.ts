/** Multi-label public suffixes that the "merge subdomains" option must not collapse. */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'go.jp',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'com.br',
  'com.mx',
  'com.ar',
  'com.co',
  'com.pe',
  'com.ve',
  'co.in',
  'co.za',
  'co.kr',
  'co.il',
  'co.id',
  'co.th',
  'com.sg',
  'com.my',
  'com.hk',
  'com.tw',
  'com.cn',
  'com.tr',
  'com.ua',
  'com.pl',
  // Hosting platforms where each subdomain is a different site.
  'github.io',
  'gitlab.io',
  'vercel.app',
  'netlify.app',
  'herokuapp.com',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'azurewebsites.net',
  'cloudfront.net',
  'amazonaws.com',
  'workers.dev',
  'fly.dev',
  'onrender.com',
  'surge.sh',
  'wordpress.com',
  'blogspot.com',
  'substack.com',
  'notion.site',
  'webflow.io',
  'myshopify.com',
]);

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'yclid',
  'igshid',
  'ref_src',
  'ref_url',
  'twclid',
  'ttclid',
  'li_fat_id',
  's_kwcid',
  'ef_id',
  '_hsenc',
  '_hsmi',
  'hsctatracking',
  'mkt_tok',
  'vero_id',
  'oly_anon_id',
  'oly_enc_id',
]);

const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'matomo_'];

export function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** True for http(s) pages the extension may group or clean up. */
export function isGroupableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Lower-cased hostname with a leading "www." removed, or null for non-URLs. */
export function hostname(url: string): string | null {
  const u = tryParseUrl(url);
  if (!u || !u.hostname) return null;
  return stripWww(u.hostname.toLowerCase());
}

export function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** eTLD+1 for common suffixes: docs.github.com -> github.com, foo.bbc.co.uk -> bbc.co.uk. */
export function baseDomain(host: string): string {
  const h = stripWww(host.toLowerCase());
  if (isIpAddress(h) || !h.includes('.')) return h;
  const parts = h.split('.');
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/** Does `host` equal `pattern` or sit under it as a subdomain? */
export function matchesDomain(host: string, pattern: string): boolean {
  const h = stripWww(host.toLowerCase());
  let p = pattern.trim().toLowerCase();
  if (p.startsWith('*.')) p = p.slice(2);
  p = stripWww(p);
  if (!p) return false;
  return h === p || h.endsWith('.' + p);
}

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  if (TRACKING_PARAMS.has(n)) return true;
  return TRACKING_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * Canonical form used for duplicate detection: lower-case scheme and host, no default port,
 * no hash, tracking params removed, remaining params sorted, no trailing slash.
 */
export function normalizeUrl(url: string): string {
  const u = tryParseUrl(url);
  if (!u) return url;
  const scheme = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();
  const defaultPort = (scheme === 'http:' && u.port === '80') || (scheme === 'https:' && u.port === '443');
  const port = u.port && !defaultPort ? ':' + u.port : '';
  const params = [...u.searchParams.entries()].filter(([k]) => !isTrackingParam(k));
  params.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? '?' + new URLSearchParams(params).toString() : '';
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return `${scheme}//${host}${port}${path}${query}`;
}
