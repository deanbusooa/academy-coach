// Tiny test harness that works in the browser (tests/index.html) and Node (tests/run-node.mjs).

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? `${msg}: ` : ''}expected ${e}, got ${a}`);
}

/**
 * In-memory Storage stand-in for store.init({ storage }).
 * Set `.failing = true` to make setItem throw like a full localStorage.
 */
export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    failing: false,
    getItem: (k) => (k in data ? data[k] : null),
    setItem(k, v) {
      if (this.failing) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      data[k] = String(v);
    },
    removeItem: (k) => { delete data[k]; },
    keys: () => Object.keys(data),
    _data: data,
  };
}

export async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
    }
  }
  return results;
}
