// Settings: age groups, money defaults, backup/restore, reset.

import * as store from '../store.js';
import { h, add, setTitle } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { buildForm, openFormModal } from '../ui/form.js';
import { confirmDialog, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { CURRENCIES, plural } from '../utils/format.js';
import { formatDate, daysBetween, todayISO, localDateOf } from '../utils/date.js';
import { ageGroupUsage, ageGroupUsageLabel, ageGroupRemovalBlocker } from '../models/players.js';
import { renameAgeGroup } from '../actions.js';
import {
  exportBackup, prepareBackup, readBackupFile, validateBackup, backupToState,
  isEncryptedBackup, decryptBackup, latestChangeAt, compareBackupAge, MIN_PASSPHRASE,
} from '../backup.js';
import { loadDemoData } from '../demo.js';
import { pageHead } from './shared.js';

export function render(container) {
  setTitle('Settings');
  const settings = store.getSettings();
  const meta = store.getMeta();

  container.append(pageHead('Settings'));
  add(container,
    backupCard(meta),
    ageGroupsCard(settings),
    preferencesCard(settings),
    demoCard(),
    dangerCard(),
    h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', textAlign: 'center' } },
      'Academy Coach stores everything on this device only. Export a backup regularly.'),
  );
}

// ---------- backup ----------

function backupCard(meta) {
  const last = localDateOf(meta.lastExportAt) || null;
  const age = last ? daysBetween(last, todayISO()) : null;
  const undo = store.getUndoCopyInfo();
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'import-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) await importFile(file);
  });

  return h('section', { class: 'card' },
    h('h3', {}, 'Backup'),
    h('p', { class: age === null || age > 14 ? 'warn-text' : 'muted' },
      last ? `Last export: ${formatDate(last)}${age > 0 ? ` (${plural(age, 'day')} ago)` : ' (today)'}` : 'No backup exported yet.'),
    h('div', { class: 'row' },
      h('button', {
        class: 'btn btn-pitch', type: 'button',
        onclick: async () => {
          const result = await exportBackup();
          if (result === 'shared') toast('Backup shared — check it was saved');
          else if (result === 'downloaded') toast('Backup downloaded');
        },
      }, icon('download'), 'Export backup'),
      h('button', { class: 'btn', type: 'button', onclick: openEncryptedExport }, icon('lock'), 'Export encrypted…'),
      h('label', { class: 'btn', for: 'import-file', role: 'button', tabindex: '0',
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } },
      icon('upload'), 'Import backup'),
      fileInput),
    h('p', { class: 'muted hint-line' },
      'A plain backup can be read by anyone who gets the file. Use an encrypted backup before emailing it or putting it in cloud storage.'),
    undo ? h('div', { class: 'undo-import' },
      h('p', {}, `Before your last import (${formatDateTime(undo.savedAt)}) you had ${countsSummary(undo.counts)}.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: undoImport }, icon('restore'), 'Undo last import'),
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: () => { store.discardUndoCopy(); toast('Undo copy discarded'); },
        }, 'Discard undo copy')))
      : null);
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function countsSummary(counts) {
  return [
    plural(counts.players || 0, 'player'), plural(counts.sessions || 0, 'session'), plural(counts.bookings || 0, 'booking'),
    plural(counts.ratings || 0, 'rating'), plural(counts.drills || 0, 'drill'),
  ].join(', ');
}

function passwordField(label, id, autocomplete) {
  const input = h('input', { class: 'input', type: 'password', id, autocomplete, minlength: MIN_PASSPHRASE });
  return { input, field: h('div', { class: 'field' }, h('label', { for: id }, label), input) };
}

/**
 * Two steps on purpose: encrypting takes a moment, and iOS only opens the
 * share sheet straight after a tap, so "Save file" is its own tap.
 */
function openEncryptedExport() {
  const pass = passwordField('Passphrase', 'backup-pass', 'new-password');
  const again = passwordField('Repeat passphrase', 'backup-pass-2', 'new-password');
  const error = h('p', { class: 'error', role: 'alert', hidden: true, style: { color: 'var(--c-bad)', fontWeight: 600 } });
  const status = h('p', { class: 'muted', role: 'status' });
  const encryptBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('lock'), 'Encrypt');
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', hidden: true }, icon('download'), 'Save file');
  let prepared = null;

  const reset = () => {
    prepared = null;
    saveBtn.hidden = true;
    encryptBtn.hidden = false;
    status.textContent = '';
    error.hidden = true;
  };
  pass.input.addEventListener('input', reset);
  again.input.addEventListener('input', reset);

  const m = openModal({
    title: 'Encrypted backup',
    body: [
      h('p', {}, `Choose a passphrase of at least ${MIN_PASSPHRASE} characters. You'll need it to import the backup. If you forget it, nobody can open the file.`),
      pass.field, again.field, error, status,
    ],
    footer: h('div', { class: 'form-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), encryptBtn, saveBtn),
  });

  encryptBtn.addEventListener('click', async () => {
    const p = pass.input.value;
    let msg = '';
    if (p.length < MIN_PASSPHRASE) msg = `Use at least ${MIN_PASSPHRASE} characters.`;
    else if (p !== again.input.value) msg = 'The passphrases do not match.';
    if (msg) {
      error.textContent = msg;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    encryptBtn.disabled = true;
    status.textContent = 'Encrypting…';
    try {
      prepared = await prepareBackup({ passphrase: p });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      status.textContent = '';
      return;
    } finally {
      encryptBtn.disabled = false;
    }
    status.textContent = 'Encrypted. Now save the file.';
    encryptBtn.hidden = true;
    saveBtn.hidden = false;
    saveBtn.focus();
  });

  saveBtn.addEventListener('click', async () => {
    if (!prepared) return;
    const result = await exportBackup({ prepared });
    if (result === 'cancelled') return;
    toast(result === 'shared' ? 'Encrypted backup shared — check it was saved' : 'Encrypted backup downloaded');
    m.close();
  });
}

/** Ask for the passphrase until it decrypts, or the coach cancels. @returns {Promise<object|null>} */
function decryptWithPrompt(wrapper) {
  return new Promise((resolve) => {
    let result = null;
    const pass = passwordField('Passphrase', 'import-pass', 'current-password');
    const error = h('p', { class: 'error', role: 'alert', hidden: true, style: { color: 'var(--c-bad)', fontWeight: 600 } });
    const unlock = h('button', { class: 'btn btn-primary', type: 'submit', form: 'unlock-form' }, icon('lock'), 'Unlock');
    const exported = wrapper.exportedAt ? ` (exported ${formatDateTime(wrapper.exportedAt)})` : '';
    const form = h('form', { id: 'unlock-form', class: 'form' },
      h('p', {}, `This backup is encrypted${exported}. Enter its passphrase.`),
      pass.field, error);
    const m = openModal({
      title: 'Encrypted backup',
      body: form,
      footer: h('div', { class: 'form-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), unlock),
      onClose: () => resolve(result),
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      unlock.disabled = true;
      try {
        result = await decryptBackup(wrapper, pass.input.value);
        m.close();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        pass.input.select();
      } finally {
        unlock.disabled = false;
      }
    });
    requestAnimationFrame(() => pass.input.focus());
  });
}

async function importFile(file) {
  let data;
  try {
    data = await readBackupFile(file);
  } catch (err) {
    toast(err.message, { type: 'error' });
    return;
  }
  if (isEncryptedBackup(data)) {
    data = await decryptWithPrompt(data);
    if (!data) return;
  }
  const { ok, errors, counts } = validateBackup(data);
  if (!ok) {
    toast(`Import failed: ${errors[0]}`, { type: 'error', duration: 5000 });
    return;
  }

  // Which is newer: the backup, or what's on this device?
  const latest = latestChangeAt(store.snapshot());
  const { older } = compareBackupAge(data.exportedAt, latest);
  const dates = [
    `Backup exported: ${formatDateTime(data.exportedAt) || 'unknown'}`,
    `Latest change on this device: ${latest ? formatDateTime(latest) : 'none yet'}`,
  ].join('\n');
  const olderNote = older
    ? '\n\nThis backup is OLDER than the data on this device. Anything changed since it was exported will be replaced.'
    : '';
  const confirmed = await confirmDialog({
    title: 'Replace all data?',
    message: `This backup contains ${countsSummary(counts)}.\n\n${dates}${olderNote}\n\nYour current data is kept as an undo copy, so you can go back from Settings.`,
    confirmLabel: 'Replace data',
    danger: true,
  });
  if (!confirmed) return;
  // Never import without a way back: if the undo copy can't be saved (storage full), stop.
  if (!store.saveUndoCopy()) return;
  try {
    if (store.replaceAll(backupToState(data))) toast('Backup restored. You can undo this in Settings.');
  } catch (err) {
    toast(err.message || 'Import failed', { type: 'error' });
  }
}

async function undoImport() {
  const info = store.getUndoCopyInfo();
  if (!info) return;
  const ok = await confirmDialog({
    title: 'Undo last import?',
    message: `Your data goes back to how it was before the import (${formatDateTime(info.savedAt)}): ${countsSummary(info.counts)}.\n\nAnything changed since the import will be lost.`,
    confirmLabel: 'Undo import',
    danger: true,
  });
  if (ok && store.restoreUndoCopy()) toast('Import undone');
}

// ---------- age groups ----------

function ageGroupsCard(settings) {
  const players = store.getAll('players');
  const input = h('input', { class: 'input', placeholder: 'e.g. U17 or Girls U12', 'aria-label': 'New age group', maxlength: 24 });
  const addGroup = (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    if (settings.ageGroups.some((g) => g.toLowerCase() === name.toLowerCase())) { toast('That age group exists', { type: 'error' }); return; }
    if (store.updateSettings({ ageGroups: [...settings.ageGroups, name] })) toast(`Added ${name}`);
  };

  return h('section', { class: 'card' },
    h('h3', {}, 'Age groups'),
    h('ul', { class: 'list' }, settings.ageGroups.map((g, i) => {
      const usage = ageGroupUsage(players, g);
      return h('li', {},
        h('div', { class: 'list-item', style: { cursor: 'default' } },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, g), h('div', { class: 'sub' }, ageGroupUsageLabel(usage))),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Move ${g} up`, disabled: i === 0,
            dataset: { focusKey: `group-up-${g}` },
            onclick: () => moveGroup(settings.ageGroups, i, -1) }, icon('arrow-up')),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Rename ${g}`,
            onclick: () => renameGroup(g, settings.ageGroups) }, icon('edit')),
          // Stays enabled when in use: a disabled button can't explain itself on touch screens.
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Remove ${g}`,
            disabled: settings.ageGroups.length === 1,
            onclick: () => removeGroup(g, settings.ageGroups, usage) }, icon('trash'))));
    })),
    h('form', { class: 'row', style: { marginTop: 'var(--s-3)' }, onsubmit: addGroup },
      h('div', { style: { flex: 1 } }, input),
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('plus'), 'Add')));
}

async function removeGroup(group, groups, usage) {
  const blocker = ageGroupRemovalBlocker(group, usage);
  if (blocker) {
    await confirmDialog({ title: `Can't remove ${group} yet`, message: blocker, confirmLabel: 'OK', cancelLabel: null });
    return;
  }
  if (store.updateSettings({ ageGroups: groups.filter((x) => x !== group) })) toast(`Removed ${group}`);
}

function moveGroup(groups, i, delta) {
  const next = groups.slice();
  [next[i], next[i + delta]] = [next[i + delta], next[i]];
  store.updateSettings({ ageGroups: next });
}

function renameGroup(oldName, groups) {
  openFormModal({
    title: `Rename ${oldName}`,
    values: { name: oldName },
    fields: [{ name: 'name', label: 'New name', required: true }],
    normalize: (v) => ({ name: String(v.name || '').trim() }),
    validate: ({ name }) => {
      if (!name) return { name: 'Enter a name' };
      if (name !== oldName && groups.some((g) => g.toLowerCase() === name.toLowerCase())) return { name: 'That age group exists' };
      return {};
    },
    onSave: ({ name }) => (name === oldName ? true : renameAgeGroup(oldName, name)),
    savedMessage: 'Age group renamed',
  });
}

// ---------- preferences ----------

function preferencesCard(settings) {
  const { form, read, showErrors } = buildForm([
    { name: 'currency', label: 'Currency', type: 'select', placeholderOption: false, options: [...new Set([settings.currency, ...CURRENCIES])] },
    [
      { name: 'defaultPrice', label: '1-1 default price', type: 'number', min: 0, step: '0.01' },
      { name: 'defaultDuration', label: '1-1 default minutes', type: 'number', min: 5, step: 5, inputmode: 'numeric' },
    ],
  ], settings);
  form.append(h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save preferences')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = read();
    const errors = {};
    if (!(v.defaultPrice >= 0)) errors.defaultPrice = 'Enter 0 or more';
    if (!(v.defaultDuration >= 5)) errors.defaultDuration = 'At least 5 minutes';
    if (showErrors(errors)) return;
    if (store.updateSettings({ currency: v.currency, defaultPrice: v.defaultPrice, defaultDuration: Math.round(v.defaultDuration) })) {
      toast('Preferences saved');
    }
  });
  return h('section', { class: 'card' }, h('h3', {}, 'Preferences'), form);
}

// ---------- demo + reset ----------

function demoCard() {
  if (!store.isEmpty()) return null; // only on a blank slate: demo data must not mix with real data
  return h('section', { class: 'card' },
    h('h3', {}, 'Try it out'),
    h('p', { class: 'muted' }, 'Load a small sample squad with drills, sessions, bookings and ratings. You can reset it afterwards.'),
    h('button', { class: 'btn', type: 'button', onclick: () => { if (loadDemoData()) { toast('Demo data loaded'); location.hash = '#/players'; } } },
      icon('ball'), 'Load demo data'));
}

function dangerCard() {
  return h('section', { class: 'card danger-card' },
    h('h3', {}, 'Reset'),
    h('p', { class: 'muted' }, 'Delete every player, session, booking, rating and drill from this device.'),
    h('button', {
      class: 'btn btn-danger', type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Delete ALL data?',
          message: 'This cannot be undone. Export a backup first if you might need it.',
          confirmLabel: 'Delete everything',
          danger: true,
        });
        if (!ok) return;
        if (store.resetAll()) toast('All data deleted');
      },
    }, icon('trash'), 'Delete all data'));
}
