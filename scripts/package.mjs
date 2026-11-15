// Builds the extension and zips the contents of dist/ for the Chrome Web Store.
// Usage: bun run package   -> release/tab-herder-<version>.zip
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const dist = resolve(root, 'dist');
const outDir = resolve(root, 'release');
const out = resolve(outDir, `tab-herder-${version}.zip`);

execSync('bun run build', { cwd: root, stdio: 'inherit' });
if (!existsSync(resolve(dist, 'manifest.json'))) throw new Error('dist/manifest.json missing after build');

mkdirSync(outDir, { recursive: true });
rmSync(out, { force: true });
// Zip the *contents* of dist so manifest.json sits at the archive root (the store requires this).
execSync(`zip -r -X "${out}" . -x ".*" -x "__MACOSX/*"`, { cwd: dist, stdio: 'inherit' });
console.log(`\nPackaged ${out}`);
