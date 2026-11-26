// Run the unit tests without a browser: `node tests/run-node.mjs`
import './tests.js';
import './node-only.js';
import { run } from './harness.js';

const results = await run();
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  ✓ ${r.name}`);
  else { failed++; console.log(`  ✗ ${r.name}\n      ${r.error}`); }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
