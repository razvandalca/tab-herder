/**
 * Scores how well `query` matches `text`. 0 means no match; higher is better.
 * Exact substring matches score highest, then subsequence matches with bonuses
 * for consecutive characters and word starts.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (!t) return 0;
  const idx = t.indexOf(q);
  if (idx !== -1) {
    const wordStart = idx === 0 || !/[a-z0-9]/.test(t[idx - 1]!);
    return 1000 + (wordStart ? 100 : 0) - Math.min(idx, 50);
  }
  // Subsequence match
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    score += 10;
    if (found === prev + 1) score += 15;
    if (found === 0 || !/[a-z0-9]/.test(t[found - 1]!)) score += 10;
    prev = found;
    ti = found + 1;
  }
  return score - Math.min(t.length - q.length, 40) / 4;
}

export interface Searchable {
  title: string;
  url: string;
}

/** Filters and sorts items by fuzzy score over title and URL (title weighted higher). */
export function fuzzySearch<T extends Searchable>(query: string, items: T[], limit = 50): T[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit);
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    let total = 0;
    for (const term of terms) {
      const s = Math.max(fuzzyScore(term, item.title) * 1.2, fuzzyScore(term, item.url));
      if (s === 0) {
        total = 0;
        break;
      }
      total += s;
    }
    if (total > 0) scored.push({ item, score: total });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
