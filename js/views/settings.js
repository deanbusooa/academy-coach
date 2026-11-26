// Settings: age groups, money defaults, backup/restore, reset.

import * as store from '../store.js';
import { h, add, setTitle } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { buildForm, openFormModal } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { CURRENCIES, plural } from '../utils/format.js';
import { formatDate, daysBetween, todayISO } from '../utils/date.js';
import { countByAgeGroup } from '../models/players.js';
import { renameAgeGroup } from '../actions.js';
import { downloadBackup, readBackupFile, validateBackup, backupToState } from '../backup.js';
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
  const last = meta.lastExportAt ? meta.lastExportAt.slice(0, 10) : null;
  const age = last ? daysBetween(last, todayISO()) : null;
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
      h('button', { class: 'btn btn-pitch', type: 'button', onclick: () => { downloadBackup(); toast('Backup downloaded'); } }, icon('download'), 'Export backup'),
      h('label', { class: 'btn', for: 'import-file', role: 'button', tabindex: '0',
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } },
      icon('upload'), 'Import backup'),
      fileInput));
}

async function importFile(file) {
  let data;
  try { data = await readBackupFile(file); } catch (err) { toast(err.message, { type: 'error' }); return; }
  const { ok, errors, counts } = validateBackup(data);
  if (!ok) { toast(`Import failed: ${errors[0]}`, { type: 'error', duration: 5000 }); return; }

  const summary = [
    plural(counts.players, 'player'), plural(counts.sessions, 'session'), plural(counts.bookings, 'booking'),
    plural(counts.ratings, 'rating'), plural(counts.drills, 'drill'),
  ].join(', ');
  const confirmed = await confirmDialog({
    title: 'Replace all data?',
    message: `This backup contains ${summary}${data.exportedAt ? `\nExported ${formatDate(data.exportedAt.slice(0, 10))}` : ''}.\n\nEverything currently on this device will be replaced.`,
    confirmLabel: 'Replace data',
    danger: true,
  });
  if (!confirmed) return;
  try {
    store.replaceAll(backupToState(data));
    toast('Backup restored');
  } catch (err) {
    toast(err.message || 'Import failed', { type: 'error' });
  }
}

// ---------- age groups ----------

function ageGroupsCard(settings) {
  const counts = countByAgeGroup(store.getAll('players'));
  const input = h('input', { class: 'input', placeholder: 'e.g. U17 or Girls U12', 'aria-label': 'New age group', maxlength: 24 });
  const addGroup = (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    if (settings.ageGroups.some((g) => g.toLowerCase() === name.toLowerCase())) { toast('That age group exists', { type: 'error' }); return; }
    store.updateSettings({ ageGroups: [...settings.ageGroups, name] });
    toast(`Added ${name}`);
  };

  return h('section', { class: 'card' },
    h('h3', {}, 'Age groups'),
    h('ul', { class: 'list' }, settings.ageGroups.map((g, i) => h('li', {},
      h('div', { class: 'list-item', style: { cursor: 'default' } },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, g), h('div', { class: 'sub' }, plural(counts[g] || 0, 'player'))),
        h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Move ${g} up`, disabled: i === 0,
          onclick: () => moveGroup(settings.ageGroups, i, -1) }, icon('arrow-up')),
        h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Rename ${g}`,
          onclick: () => renameGroup(g, settings.ageGroups) }, icon('edit')),
        h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Remove ${g}`,
          disabled: Boolean(counts[g]) || settings.ageGroups.length === 1,
          title: counts[g] ? 'Move or delete its players first' : null,
          onclick: () => { store.updateSettings({ ageGroups: settings.ageGroups.filter((x) => x !== g) }); toast(`Removed ${g}`); } }, icon('trash')))))),
    h('form', { class: 'row', style: { marginTop: 'var(--s-3)' }, onsubmit: addGroup },
      h('div', { style: { flex: 1 } }, input),
      h('button', { class: 'btn btn-primary', type: 'submit' }, icon('plus'), 'Add')));
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
    onSave: ({ name }) => { if (name !== oldName) renameAgeGroup(oldName, name); },
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
    store.updateSettings({ currency: v.currency, defaultPrice: v.defaultPrice, defaultDuration: Math.round(v.defaultDuration) });
    toast('Preferences saved');
  });
  return h('section', { class: 'card' }, h('h3', {}, 'Preferences'), form);
}

// ---------- demo + reset ----------

function demoCard() {
  if (store.getAll('players').length) return null;
  return h('section', { class: 'card' },
    h('h3', {}, 'Try it out'),
    h('p', { class: 'muted' }, 'Load a small sample squad with drills, sessions, bookings and ratings. You can reset it afterwards.'),
    h('button', { class: 'btn', type: 'button', onclick: () => { loadDemoData(); toast('Demo data loaded'); location.hash = '#/players'; } },
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
        store.resetAll();
        toast('All data deleted');
      },
    }, icon('trash'), 'Delete all data'));
}
