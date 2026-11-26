// Single source of truth for app data.
// The ONLY module that touches localStorage. Views read via getAll/get and
// write via upsert/remove/updateSettings; every write persists and notifies.

export const STORAGE_KEY = 'academyCoach.v1';
export const SCHEMA_VERSION = 1;
export const COLLECTIONS = ['players', 'drills', 'sessions', 'bookings', 'ratings'];

export const DEFAULT_AGE_GROUPS = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16'];

export function defaultSettings() {
  return {
    ageGroups: [...DEFAULT_AGE_GROUPS],
    currency: 'GBP',
    defaultPrice: 30,
    defaultDuration: 60,
  };
}

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    players: [],
    drills: [],
    sessions: [],
    bookings: [],
    ratings: [],
    settings: defaultSettings(),
    meta: { lastExportAt: null, createdAt: new Date().toISOString() },
  };
}

let state = defaultState();
let storage = null;
let listeners = new Set();
let batchDepth = 0;
let dirty = false;
let lastLoadWarning = null;

// ---------- lifecycle ----------

/**
 * Load state from storage. `opts.storage` lets tests inject an in-memory
 * Storage-like object ({getItem, setItem, removeItem}).
 */
export function init(opts = {}) {
  storage = opts.storage ?? globalThis.localStorage ?? null;
  listeners = new Set();
  lastLoadWarning = null;
  state = defaultState();

  if (!storage) return state;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return state;

  try {
    state = normalizeState(migrate(JSON.parse(raw)));
  } catch (err) {
    // Keep the unreadable data aside so nothing is silently lost.
    try { storage.setItem(`${STORAGE_KEY}.corrupt-${Date.now()}`, raw); } catch { /* ignore */ }
    lastLoadWarning = 'Saved data could not be read and was set aside. Starting fresh — import a backup to restore.';
    console.error('[store] failed to load state', err);
    state = defaultState();
  }
  return state;
}

export function getLoadWarning() {
  return lastLoadWarning;
}

/**
 * Upgrade older saved shapes to the current schema. Add a step per version:
 *   if (data.schemaVersion < 2) { ...; data.schemaVersion = 2; }
 */
export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('State is not an object');
  const version = Number(data.schemaVersion) || 1;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Data is from a newer version of the app (schema ${version}).`);
  }
  // No migrations yet — schema 1 is the first release.
  return { ...data, schemaVersion: SCHEMA_VERSION };
}

/** Fill any missing collections/settings with defaults. */
export function normalizeState(data) {
  const base = defaultState();
  const out = { ...base, ...data };
  for (const c of COLLECTIONS) out[c] = Array.isArray(data[c]) ? data[c] : [];
  out.settings = { ...base.settings, ...(data.settings || {}) };
  if (!Array.isArray(out.settings.ageGroups) || out.settings.ageGroups.length === 0) {
    out.settings.ageGroups = [...DEFAULT_AGE_GROUPS];
  }
  out.meta = { ...base.meta, ...(data.meta || {}) };
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

// ---------- subscriptions ----------

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  if (batchDepth > 0) { dirty = true; return; }
  persist();
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('[store] listener failed', err); }
  }
}

function persist() {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[store] failed to save', err);
    throw new Error('Could not save — device storage may be full. Export a backup.');
  }
}

/** Group several writes into one save + one notification. */
export function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && dirty) { dirty = false; commit(); }
  }
}

// ---------- reads ----------

function assertCollection(c) {
  if (!COLLECTIONS.includes(c)) throw new Error(`Unknown collection "${c}"`);
}

export function getAll(collection) {
  assertCollection(collection);
  return state[collection].slice();
}

export function get(collection, id) {
  assertCollection(collection);
  return state[collection].find((r) => r.id === id) ?? null;
}

export function getSettings() {
  return { ...state.settings, ageGroups: [...state.settings.ageGroups] };
}

export function getMeta() {
  return { ...state.meta };
}

// ---------- writes ----------

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Insert or replace a record by id. Returns the stored record. */
export function upsert(collection, record) {
  assertCollection(collection);
  const now = new Date().toISOString();
  const list = state[collection];
  const idx = record.id ? list.findIndex((r) => r.id === record.id) : -1;
  let saved;
  if (idx >= 0) {
    saved = { ...list[idx], ...record, updatedAt: now };
    state = { ...state, [collection]: list.map((r, i) => (i === idx ? saved : r)) };
  } else {
    saved = { ...record, id: record.id || newId(), createdAt: record.createdAt || now, updatedAt: now };
    state = { ...state, [collection]: [...list, saved] };
  }
  commit();
  return saved;
}

export function remove(collection, id) {
  assertCollection(collection);
  const before = state[collection].length;
  state = { ...state, [collection]: state[collection].filter((r) => r.id !== id) };
  if (state[collection].length !== before) commit();
}

export function removeWhere(collection, predicate) {
  assertCollection(collection);
  const kept = state[collection].filter((r) => !predicate(r));
  const removed = state[collection].length - kept.length;
  if (removed) {
    state = { ...state, [collection]: kept };
    commit();
  }
  return removed;
}

export function updateSettings(patch) {
  state = { ...state, settings: { ...state.settings, ...patch } };
  commit();
  return getSettings();
}

export function updateMeta(patch) {
  state = { ...state, meta: { ...state.meta, ...patch } };
  commit();
}

// ---------- whole-state operations (backup) ----------

/** Deep copy of everything, for export. */
export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

/** Replace all data (used by import). Input must already be validated. */
export function replaceAll(data) {
  state = normalizeState(migrate(JSON.parse(JSON.stringify(data))));
  commit();
}

export function resetAll() {
  state = defaultState();
  commit();
}
