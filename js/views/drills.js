// Drill library: search, filter, add/edit/delete.

import * as store from '../store.js';
import { h, setTitle } from '../utils/dom.js';
import { openFormModal, confirmDialog } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { formatDuration, plural } from '../utils/format.js';
import { normalizeDrill, validateDrill, filterDrills, listToLines } from '../models/drills.js';
import { deleteDrill, sessionsUsingDrill } from '../actions.js';
import { pageHead, emptyState, fab, filterChips, searchBox } from './shared.js';

const ui = { query: '', ageGroup: '' };

export function render(container) {
  setTitle('Drills');
  const drills = store.getAll('drills');
  const settings = store.getSettings();

  container.append(pageHead('Drill library', h('span', { class: 'badge badge-muted' }, plural(drills.length, 'drill'))));

  if (!drills.length) {
    container.append(
      emptyState({
        iconName: 'drills',
        text: 'Build your drill library once, then pick drills when planning sessions.',
        action: h('button', { class: 'btn btn-primary', onclick: () => openDrillForm() }, 'Add first drill'),
      }),
      fab('Add drill', () => openDrillForm()),
    );
    return;
  }

  const listWrap = h('div');
  const renderList = () => {
    const filtered = filterDrills(drills, ui);
    listWrap.replaceChildren(filtered.length
      ? h('div', { class: 'drill-list' }, filtered.map((d) => drillCard(d)))
      : h('p', { class: 'empty' }, 'No drills match.'));
  };

  container.append(
    searchBox({ value: ui.query, placeholder: 'Search name, equipment, coaching points', onInput: (v) => { ui.query = v; renderList(); } }),
    filterChips({
      label: 'Suitable for',
      allLabel: 'All ages',
      value: ui.ageGroup,
      options: settings.ageGroups.map((g) => ({ value: g, label: g })),
      onChange: (v) => { ui.ageGroup = v; container.replaceChildren(); render(container); },
    }),
    listWrap,
    fab('Add drill', () => openDrillForm()),
  );
  renderList();
}

/**
 * Expandable drill card. Used here and in the session plan.
 * `extra` is rendered on the summary row's right (e.g. reorder buttons).
 */
export function drillCard(d, { extra = null, showEdit = true, index = null } = {}) {
  return h('details', { class: 'drill' },
    h('summary', {},
      index !== null ? h('span', { class: 'drill-index' }, String(index + 1)) : null,
      h('span', { class: 'grow' },
        h('span', { class: 'title' }, d.name),
        d.equipment.length ? h('span', { class: 'sub' }, d.equipment.join(', ')) : null),
      h('span', { class: 'badge' }, formatDuration(d.durationMin)),
      extra),
    h('div', { class: 'drill-body' },
      d.coachingPoints.length
        ? [h('div', { class: 'section-label' }, 'Coaching points'),
          h('ul', { class: 'points' }, d.coachingPoints.map((p) => h('li', {}, p)))]
        : h('p', { class: 'muted' }, 'No coaching points.'),
      d.equipment.length
        ? [h('div', { class: 'section-label' }, 'Equipment'), h('p', {}, d.equipment.join(' · '))]
        : null,
      d.ageGroups?.length ? h('p', { class: 'row' }, d.ageGroups.map((g) => h('span', { class: 'badge badge-muted' }, g))) : null,
      d.notes ? h('p', { class: 'pre-line muted' }, d.notes) : null,
      showEdit ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openDrillForm(d) }, icon('edit'), 'Edit drill') : null,
    ));
}

export function openDrillForm(drill = null, { onSaved } = {}) {
  const settings = store.getSettings();
  const isEdit = Boolean(drill);
  openFormModal({
    title: isEdit ? 'Edit drill' : 'Add drill',
    values: drill
      ? { ...drill, equipment: listToLines(drill.equipment), coachingPoints: listToLines(drill.coachingPoints) }
      : { durationMin: 15 },
    fields: [
      [
        { name: 'name', label: 'Drill name', required: true, placeholder: 'e.g. Rondo 4v1' },
        { name: 'durationMin', label: 'Minutes', type: 'number', required: true, min: 1, max: 240, step: 1, inputmode: 'numeric' },
      ],
      { name: 'equipment', label: 'Equipment (one per line)', type: 'textarea', rows: 3, placeholder: '10 cones\n4 bibs\n1 ball per pair' },
      { name: 'coachingPoints', label: 'Coaching points (one per line)', type: 'textarea', rows: 4, placeholder: 'Open body to receive\nPass on the half-turn' },
      { name: 'ageGroups', label: 'Suitable for (leave empty for all ages)', type: 'chips', options: settings.ageGroups },
      { name: 'notes', label: 'Setup notes', type: 'textarea', rows: 2, placeholder: '20×20m grid…' },
    ],
    normalize: normalizeDrill,
    validate: validateDrill,
    onSave: (rec) => {
      const saved = store.upsert('drills', rec);
      if (!saved) return false;
      onSaved?.(saved);
      return true;
    },
    savedMessage: isEdit ? 'Drill updated' : 'Drill added',
    onDelete: isEdit ? async () => {
      const used = sessionsUsingDrill(drill.id);
      const ok = await confirmDialog({
        title: `Delete “${drill.name}”?`,
        message: used ? `It will also be removed from ${plural(used, 'session plan')}.` : 'This cannot be undone.',
        confirmLabel: 'Delete drill',
        danger: true,
      });
      if (!ok) return false;
      if (!deleteDrill(drill.id)) return false;
      toast('Drill deleted');
      return true;
    } : null,
  });
}
