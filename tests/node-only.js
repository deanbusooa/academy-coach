// Tests that read the source tree, so they only run under Node (tests/run-node.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : [rel];
  });
}

test('sw.js ASSETS matches the app files on disk', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const block = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert(block, 'ASSETS array not found in sw.js');
  const listed = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const dupes = listed.filter((a, i) => listed.indexOf(a) !== i);
  assert(!dupes.length, `duplicate ASSETS entries: ${dupes.join(', ')}`);

  // Everything the app loads: the shell plus every file under js/, css/, assets/.
  const expected = ['./', './index.html', './manifest.webmanifest',
    ...['js', 'css', 'assets'].flatMap(walk).map((f) => `./${f}`)];

  const missing = expected.filter((f) => !listed.includes(f));
  const stale = listed.filter((f) => f !== './' && !fs.existsSync(path.join(ROOT, f)));
  const unexpected = listed.filter((f) => !expected.includes(f) && !stale.includes(f));
  assert(!missing.length, `add to ASSETS (and bump CACHE_VERSION): ${missing.join(', ')}`);
  assert(!stale.length, `ASSETS lists files that don't exist (install would fail): ${stale.join(', ')}`);
  assert(!unexpected.length, `ASSETS lists files outside the app shell: ${unexpected.join(', ')}`);
});

test('source: no .slice(0, 10) on timestamps — use localDateOf() (regression)', () => {
  const offenders = [];
  for (const file of walk('js').filter((f) => f.endsWith('.js'))) {
    fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
      if (/(createdAt|updatedAt|lastExportAt|exportedAt)\b[^;\n]*\.slice\(0,\s*10\)/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert(!offenders.length, `UTC date slicing found at ${offenders.join(', ')}`);
});
