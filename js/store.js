// Single source of truth for app data.
// The ONLY module that touches localStorage. Views read via getAll/get and
// write via upsert/remove/updateSettings; every write persists and notifies.

import { normalizePlayer } from './models/players.js';
import { normalizeDrill } from './models/drills.js';
import { normalizeSession } from './models/sessions.js';
import { normalizeBooking } from './models/bookings.js';
import { normalizeRating } from './models/ratings.js';

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
  batchDepth = 0;
  dirty = false;
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

const NORMALIZERS = {
  players: normalizePlayer,
  drills: normalizeDrill,
  sessions: normalizeSession,
  bookings: normalizeBooking,
  ratings: normalizeRating,
};

/** Run one stored record through its model normaliser, keeping store-owned fields. */
function normalizeRecord(collection, r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const id = typeof r.id === 'string' && r.id ? r.id : newId();
  const out = { ...NORMALIZERS[collection](r), id };
  for (const k of ['createdAt', 'updatedAt']) if (typeof r[k] === 'string') out[k] = r[k];
  return out;
}

function normalizeSettings(s) {
  const base = defaultSettings();
  if (!s || typeof s !== 'object' || Array.isArray(s)) return base;
  const groups = Array.isArray(s.ageGroups)
    ? [...new Set(s.ageGroups.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim()))]
    : [];
  const num = (v, fallback, min) => (Number.isFinite(Number(v)) && Number(v) >= min ? Number(v) : fallback);
  return {
    ...base,
    ageGroups: groups.length ? groups : base.ageGroups,
    currency: typeof s.currency === 'string' && /^[A-Z]{3}$/.test(s.currency) ? s.currency : base.currency,
    defaultPrice: num(s.defaultPrice, base.defaultPrice, 0),
    defaultDuration: Math.round(num(s.defaultDuration, base.defaultDuration, 5)),
  };
}

/**
 * Make loaded/imported data safe for the views: every record goes through its
 * model's normalizeX(), non-objects are dropped, missing ids are assigned,
 * and settings fall back to defaults field by field.
 */
export function normalizeState(data) {
  const base = defaultState();
  const out = { ...base, schemaVersion: SCHEMA_VERSION };
  for (const c of COLLECTIONS) {
    out[c] = Array.isArray(data[c]) ? data[c].map((r) => normalizeRecord(c, r)).filter(Boolean) : [];
  }
  out.settings = normalizeSettings(data.settings);
  const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
  out.meta = {
    ...base.meta,
    lastExportAt: typeof meta.lastExportAt === 'string' ? meta.lastExportAt : null,
    createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : base.meta.createdAt,
  };
  return out;
}

// ---------- subscriptions ----------

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- save errors ----------

const defaultSaveErrorHandler = (err) => console.error('[store]', err.message, err.cause);
let saveErrorHandler = defaultSaveErrorHandler;

/**
 * The one place save failures are reported (app.js shows a toast). Writes never
 * throw on a failed save: they roll back and return null/false instead.
 */
export function onSaveError(fn) {
  saveErrorHandler = fn || defaultSaveErrorHandler;
}

function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('[store] listener failed', err); }
  }
}

/** @returns {boolean} true if saved (or no storage) */
function persist() {
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (cause) {
    const err = new Error('Could not save — device storage may be full. Export a backup and free up space.', { cause });
    try { saveErrorHandler(err); } catch (e) { console.error('[store] save error handler failed', e); }
    return false;
  }
}

/**
 * Swap in the next state, save, then notify. If saving fails the previous
 * state is restored so memory never drifts from storage.
 * Inside a batch, only the swap happens; batch() saves once at the end.
 * @returns {boolean} whether the change was kept
 */
function apply(next) {
  if (batchDepth > 0) { state = next; dirty = true; return true; }
  const prev = state;
  state = next;
  if (!persist()) { state = prev; return false; }
  notify();
  return true;
}

/**
 * Group several writes into one save + one notification. All-or-nothing:
 * if the save fails, or fn throws, every write in the batch is rolled back.
 * @returns {boolean} whether the batch was saved (always true for nested batches)
 */
export function batch(fn) {
  const outermost = batchDepth === 0;
  const start = state;
  batchDepth++;
  try {
    fn();
  } catch (err) {
    batchDepth--;
    if (outermost) { state = start; dirty = false; }
    throw err;
  }
  batchDepth--;
  if (!outermost || !dirty) return true;
  dirty = false;
  if (!persist()) { state = start; return false; }
  notify();
  return true;
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

/**
 * Insert or replace a record by id.
 * @returns the stored record, or null if it could not be saved (state unchanged).
 */
export function upsert(collection, record) {
  assertCollection(collection);
  const now = new Date().toISOString();
  const list = state[collection];
  const idx = record.id ? list.findIndex((r) => r.id === record.id) : -1;
  let saved;
  let nextList;
  if (idx >= 0) {
    saved = { ...list[idx], ...record, updatedAt: now };
    nextList = list.map((r, i) => (i === idx ? saved : r));
  } else {
    saved = { ...record, id: record.id || newId(), createdAt: record.createdAt || now, updatedAt: now };
    nextList = [...list, saved];
  }
  return apply({ ...state, [collection]: nextList }) ? saved : null;
}

/** @returns {boolean} false if nothing matched or the save failed */
export function remove(collection, id) {
  assertCollection(collection);
  const kept = state[collection].filter((r) => r.id !== id);
  if (kept.length === state[collection].length) return false;
  return apply({ ...state, [collection]: kept });
}

/** @returns {number} how many records were removed (0 if the save failed) */
export function removeWhere(collection, predicate) {
  assertCollection(collection);
  const kept = state[collection].filter((r) => !predicate(r));
  const removed = state[collection].length - kept.length;
  if (!removed) return 0;
  return apply({ ...state, [collection]: kept }) ? removed : 0;
}

/** @returns the new settings, or null if the save failed */
export function updateSettings(patch) {
  return apply({ ...state, settings: { ...state.settings, ...patch } }) ? getSettings() : null;
}

export function updateMeta(patch) {
  return apply({ ...state, meta: { ...state.meta, ...patch } });
}

// ---------- whole-state operations (backup) ----------

/** Deep copy of everything, for export. */
export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

/** Replace all data (used by import). Input must already be validated. @returns {boolean} */
export function replaceAll(data) {
  return apply(normalizeState(migrate(JSON.parse(JSON.stringify(data)))));
}

/** @returns {boolean} */
export function resetAll() {
  return apply(defaultState());
}
