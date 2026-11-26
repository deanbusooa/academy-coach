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
