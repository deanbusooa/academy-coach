// JSON export/import. Validation is pure (testable); download/readFile touch the DOM.

import * as store from './store.js';
import { todayISO } from './utils/date.js';

export const BACKUP_APP_ID = 'academy-coach';

export function buildBackup(state, now = new Date()) {
  return { app: BACKUP_APP_ID, exportedAt: now.toISOString(), ...state };
}

export function backupFilename(today = todayISO()) {
  return `academy-coach-backup-${today}.json`;
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

export function downloadBackup() {
  const payload = buildBackup(store.snapshot());
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  store.updateMeta({ lastExportAt: payload.exportedAt });
  return payload;
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
