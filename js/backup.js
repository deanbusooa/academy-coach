// JSON export/import. Validation is pure (testable); download/readFile touch the DOM.

import * as store from './store.js';
import { todayISO } from './utils/date.js';

export const BACKUP_APP_ID = 'academy-coach';

export function buildBackup(state, now = new Date()) {
  return { app: BACKUP_APP_ID, exportedAt: now.toISOString(), ...state };
}

export function backupFilename(today = todayISO(), { encrypted = false } = {}) {
  return `academy-coach-backup-${today}${encrypted ? '.encrypted' : ''}.json`;
}

// ---------- optional passphrase encryption (Web Crypto) ----------
// AES-GCM-256 with a key from PBKDF2-SHA256. The file is a small JSON wrapper:
// salt, IV and iteration count are stored in the clear (they aren't secret);
// everything else, including names and contacts, is in `data`.

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;

function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export function isEncryptedBackup(data) {
  return Boolean(data && data.app === BACKUP_APP_ID && data.encrypted === true && typeof data.data === 'string');
}

/** Encrypt a backup payload with a passphrase. `iterations` is lowered only in tests. */
export async function encryptBackup(payload, passphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipherText = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    app: BACKUP_APP_ID,
    encrypted: true,
    format: 1,
    exportedAt: payload.exportedAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(cipherText),
  };
}

/** Decrypt an encrypted backup wrapper. Throws a friendly error on a wrong passphrase or damaged file. */
export async function decryptBackup(wrapper, passphrase) {
  if (!isEncryptedBackup(wrapper) || wrapper.format !== 1 || wrapper.kdf?.name !== 'PBKDF2' || wrapper.cipher?.name !== 'AES-GCM') {
    throw new Error("This encrypted backup is in a format this version of the app can't read.");
  }
  let plain;
  try {
    const key = await deriveKey(passphrase, fromB64(wrapper.kdf.salt), wrapper.kdf.iterations);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(wrapper.cipher.iv) }, key, fromB64(wrapper.data));
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------- import safety ----------

/** Most recent change in the data on this device (any record's updatedAt/createdAt), or null. */
export function latestChangeAt(state) {
  let latest = null;
  for (const c of store.COLLECTIONS) {
    for (const r of state[c] || []) {
      const t = r.updatedAt || r.createdAt;
      if (typeof t === 'string' && (!latest || t > latest)) latest = t;
    }
  }
  return latest;
}

/** Compare a backup's export time with the latest local change (both ISO). */
export function compareBackupAge(exportedAt, latestChange) {
  if (!exportedAt || !latestChange) return { older: false, known: Boolean(exportedAt && latestChange) };
  return { older: exportedAt < latestChange, known: true };
}

/**
 * Check a parsed backup before it replaces everything.
 * @returns {{ ok: boolean, errors: string[], counts: Record<string, number> }}
 */
export function validateBackup(data) {
  const errors = [];
  const counts = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['File is not an Academy Coach backup.'], counts };
  }
  if (data.app !== undefined && data.app !== BACKUP_APP_ID) errors.push('File is from a different app.');
  const version = Number(data.schemaVersion);
  if (!Number.isInteger(version) || version < 1) errors.push('Missing schema version.');
  else if (version > store.SCHEMA_VERSION) errors.push('Backup is from a newer version of the app. Update first.');

  for (const c of store.COLLECTIONS) {
    const list = data[c];
    if (list === undefined) { counts[c] = 0; continue; }
    if (!Array.isArray(list)) { errors.push(`"${c}" should be a list.`); continue; }
    const bad = list.findIndex((r) => !r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id);
    if (bad !== -1) errors.push(`"${c}" item ${bad + 1} is missing an id.`);
    counts[c] = list.length;
  }
  if (Array.isArray(data.players) && data.players.some((p) => typeof p?.name !== 'string')) {
    errors.push('Some players have no name.');
  }
  if (data.settings !== undefined && (typeof data.settings !== 'object' || Array.isArray(data.settings))) {
    errors.push('"settings" is malformed.');
  }
  return { ok: errors.length === 0, errors, counts };
}

/** Strip backup-only fields so the rest can go to store.replaceAll(). */
export function backupToState(data) {
  const { app, exportedAt, ...rest } = data;
  return rest;
}

// ---------- DOM side ----------

/** Phones/tablets: the share sheet is the reliable way to save a file there. */
function prefersShareSheet() {
  return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function triggerDownload(json, filename, doc) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hand the backup file to the user.
 * On touch devices that can share files, opens the OS share sheet ("Save to
 * Files", Drive, email…), because iOS home-screen apps ignore <a download>.
 * Everywhere else, or if sharing fails, downloads the file.
 * Must be called straight from a click (share needs the user gesture).
 * Dependencies are injectable for tests.
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>} 'cancelled' does not count as a backup.
 */
/**
 * Build the backup file contents now, optionally encrypted. Done before the
 * click that saves it, because encryption takes a moment and iOS only allows
 * the share sheet straight after a tap.
 */
export async function prepareBackup({ passphrase = null, iterations } = {}) {
  const payload = buildBackup(store.snapshot());
  const body = passphrase ? await encryptBackup(payload, passphrase, { iterations }) : payload;
  return {
    json: JSON.stringify(body, null, 2),
    exportedAt: payload.exportedAt,
    filename: backupFilename(todayISO(), { encrypted: Boolean(passphrase) }),
    encrypted: Boolean(passphrase),
  };
}

export async function exportBackup({
  nav = globalThis.navigator, doc = globalThis.document, preferShare = prefersShareSheet(), prepared = null,
} = {}) {
  const { json, filename, exportedAt } = prepared || await prepareBackup();
  let method = null;

  const file = typeof File === 'function' ? new File([json], filename, { type: 'application/json' }) : null;
  if (preferShare && file && typeof nav?.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Academy Coach backup' });
      method = 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      console.warn('[backup] share failed, downloading instead', err);
    }
  }
  if (!method) {
    triggerDownload(json, filename, doc);
    method = 'downloaded';
  }
  store.updateMeta({ lastExportAt: exportedAt });
  return method;
}

export async function readBackupFile(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('File is too large to be a backup.');
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
}
