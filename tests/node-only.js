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

test('source: no .slice(0, 10) on timestamps — use localDateOf() (regression)', () => {
  const offenders = [];
  for (const file of walk('js').filter((f) => f.endsWith('.js'))) {
    fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
      if (/(createdAt|updatedAt|lastExportAt|exportedAt)\b[^;\n]*\.slice\(0,\s*10\)/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert(!offenders.length, `UTC date slicing found at ${offenders.join(', ')}`);
});
