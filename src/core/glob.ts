const escapeRegex = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

const cache = new Map<string, RegExp | null>();

/**
 * Converts a Chrome-style match pattern into a RegExp.
 *   scheme: a star matches any scheme; an omitted scheme means any scheme
 *   host:   a star matches any run of non-slash characters; a leading "star-dot" also matches the bare domain
 *   path:   a star matches anything (including slashes); an omitted path matches any path
 * See the README for examples.
 */
export function globToRegExp(glob: string): RegExp | null {
  const cached = cache.get(glob);
  if (cached !== undefined) return cached;
  const re = compile(glob.trim());
  cache.set(glob, re);
  return re;
}

function compile(glob: string): RegExp | null {
  if (!glob) return null;
  let rest = glob;
  let schemeRe = '[a-z][a-z0-9+.-]*';
  const schemeIdx = rest.indexOf('://');
  if (schemeIdx !== -1) {
    const scheme = rest.slice(0, schemeIdx);
    schemeRe = scheme === '*' ? '[a-z][a-z0-9+.-]*' : escapeRegex(scheme);
    rest = rest.slice(schemeIdx + 3);
  }
  const slash = rest.indexOf('/');
  const hostGlob = slash === -1 ? rest : rest.slice(0, slash);
  const pathGlob = slash === -1 ? null : rest.slice(slash);

  let hostRe: string;
  if (hostGlob === '*' || hostGlob === '') {
    hostRe = '[^/]*';
  } else {
    const optionalSub = hostGlob.startsWith('*.');
    const h = optionalSub ? hostGlob.slice(2) : hostGlob;
    hostRe = (optionalSub ? '(?:[^/]*\\.)?' : '') + escapeRegex(h).replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  }
  const pathRe = pathGlob === null ? '(?:/.*)?' : escapeRegex(pathGlob).replace(/\*/g, '.*').replace(/\?/g, '.');
  try {
    return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`, 'i');
  } catch {
    return null;
  }
}

export function globMatches(glob: string, url: string): boolean {
  const re = globToRegExp(glob);
  return re ? re.test(url) : false;
}
