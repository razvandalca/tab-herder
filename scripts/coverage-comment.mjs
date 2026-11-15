// Turns coverage/coverage-summary.json into a markdown PR comment at coverage/comment.md.
// Usage: bun run coverage && bun scripts/coverage-comment.mjs [run-url]
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const summary = JSON.parse(readFileSync(resolve(root, 'coverage/coverage-summary.json'), 'utf8'));
const runUrl = process.argv[2];

const METRICS = ['lines', 'statements', 'branches', 'functions'];
const icon = (pct) => (pct >= 95 ? '🟢' : pct >= 85 ? '🟡' : '🔴');
const cell = (m) => `${icon(m.pct)} ${m.pct}% <sub>(${m.covered}/${m.total})</sub>`;

const { total, ...files } = summary;
const fileRows = Object.entries(files)
  .map(([path, m]) => [relative(root, path), m])
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, m]) => `| \`${path}\` | ${METRICS.map((k) => `${m[k].pct}%`).join(' | ')} |`);

const body = [
  '<!-- coverage-report -->',
  '### 🧪 Test coverage (`src/core`)',
  '',
  '| Lines | Statements | Branches | Functions |',
  '|---|---|---|---|',
  `| ${METRICS.map((k) => cell(total[k])).join(' | ')} |`,
  '',
  '<details><summary>Per file</summary>',
  '',
  '| File | Lines | Statements | Branches | Functions |',
  '|---|---|---|---|---|',
  ...fileRows,
  '',
  '</details>',
  '',
  runUrl ? `<sub>Full HTML report: \`coverage-report\` artifact on [this run](${runUrl}).</sub>` : '',
].join('\n');

writeFileSync(resolve(root, 'coverage/comment.md'), body);
console.log(body);
