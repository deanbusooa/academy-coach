// One group session: drill plan (pick from library, reorder) + attendance register.

import * as store from '../store.js';
import { h, add, setTitle } from '../utils/dom.js';
import { href } from '../router.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatDuration, plural } from '../utils/format.js';
import { formatDate } from '../utils/date.js';
import {
  sessionDrills, totalDuration, moveDrill, removeDrillAt, sessionRoster, attendanceSummary,
  nextAttendance, setAttendance, markAll, ATTENDANCE_LABEL,
} from '../models/sessions.js';
import { filterDrills, equipmentFor } from '../models/drills.js';
import { openSessionForm } from './sessions.js';
import { drillCard, openDrillForm } from './drills.js';
import { backLink, emptyState } from './shared.js';

export function render(container, { id }) {
  const session = store.get('sessions', id);
  if (!session) {
    setTitle('Session');
    container.append(backLink(href('/sessions'), 'Sessions'), emptyState({ iconName: 'sessions', text: 'This session no longer exists.' }));
    return;
  }
  setTitle(`${session.ageGroup} session`);

  const drills = store.getAll('drills');
  const planned = sessionDrills(session, drills);
  const mins = totalDuration(session, drills);

  add(container,
    backLink(href('/sessions'), 'Sessions'),
    h('div', { class: 'page-head' },
      h('div', { class: 'grow' },
        h('h2', {}, session.title || `${session.ageGroup} training`),
        h('div', { class: 'row muted' },
          h('span', { class: 'badge' }, session.ageGroup),
          formatDate(session.date),
          session.time ? ` · ${session.time}` : '',
          session.location ? ` · ${session.location}` : '')),
      h('button', { class: 'btn btn-sm', dataset: { focusKey: 'edit' }, onclick: () => openSessionForm(session) }, icon('edit'), 'Edit')),
    session.notes ? h('p', { class: 'pre-line muted' }, session.notes) : null,
  );

  // ---- Register first: it's what the coach needs on the pitch.
  container.append(registerCard(session));

  // ---- Plan
  const planCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, 'Session plan'),
      h('span', { class: 'badge badge-muted' }, `${plural(planned.length, 'drill')} · ${formatDuration(mins)}`)),
    planned.length
      ? h('div', { class: 'drill-list' }, planned.map((d, i) => drillCard(d, {
        index: i,
        showEdit: false,
        extra: h('span', { class: 'reorder', onclick: (e) => e.preventDefault() },
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Move ${d.name} up`, disabled: i === 0,
            dataset: { focusKey: `up-${d.id}` },
            onclick: () => store.upsert('sessions', moveDrill(session, i, -1)) }, icon('arrow-up')),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Move ${d.name} down`, disabled: i === planned.length - 1,
            dataset: { focusKey: `down-${d.id}` },
            onclick: () => store.upsert('sessions', moveDrill(session, i, 1)) }, icon('arrow-down')),
          h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Remove ${d.name}`,
            onclick: () => store.upsert('sessions', removeDrillAt(session, i)) }, icon('x'))),
      })))
      : h('p', { class: 'muted' }, 'No drills yet.'),
    h('div', { class: 'row', style: { marginTop: 'var(--s-3)' } },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openDrillPicker(session.id) }, icon('plus'), 'Add drills')),
  );
  container.append(planCard);

  const kit = equipmentFor(planned);
  if (kit.length) {
    container.append(h('section', { class: 'card' },
      h('h3', {}, 'Kit list'),
      h('ul', { class: 'points' }, kit.map((k) => h('li', {}, k)))));
  }
}

function registerCard(session) {
  const players = store.getAll('players');
  const roster = sessionRoster(players, session);
  const sum = attendanceSummary(session, roster);

  const card = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, 'Register'),
      roster.length ? h('button', {
        class: 'btn btn-sm', type: 'button', dataset: { focusKey: 'all-present' },
        onclick: () => { if (store.upsert('sessions', markAll(session, roster.map((p) => p.id)))) toast('All marked present'); },
      }, icon('check'), 'All present') : null),
  );

  if (!roster.length) {
    card.append(h('p', { class: 'muted' }, `No ${session.ageGroup} players on the roster yet. `,
      h('a', { href: href('/players') }, 'Add players')));
    return card;
  }

  add(card,
    h('div', { class: 'att-summary' },
      h('span', { class: 'badge badge-ok' }, `${sum.present} present`),
      h('span', { class: 'badge badge-warn' }, `${sum.late} late`),
      h('span', { class: 'badge badge-bad' }, `${sum.absent} absent`),
      sum.unmarked ? h('span', { class: 'badge badge-muted' }, `${sum.unmarked} unmarked`) : null),
    h('p', { class: 'muted hint-line' }, 'Tap a player: present → late → absent → clear'),
    h('div', { class: 'att-grid' }, roster.map((p) => {
      const status = session.attendance?.[p.id] || '';
      return h('button', {
        type: 'button',
        dataset: { focusKey: `att-${p.id}` },
        class: ['att-tile', status && `is-${status}`],
        'aria-label': `${p.name}: ${status ? ATTENDANCE_LABEL[status] : 'not marked'}. Tap to change.`,
        onclick: () => {
          const fresh = store.get('sessions', session.id);
          store.upsert('sessions', setAttendance(fresh, p.id, nextAttendance(fresh.attendance?.[p.id])));
        },
      },
      h('span', { class: 'att-name' }, p.name),
      h('span', { class: 'att-status' }, status ? ATTENDANCE_LABEL[status] : '—'),
      p.ageGroup !== session.ageGroup ? h('span', { class: 'att-guest' }, p.ageGroup) : null);
    })),
    guestPicker(session, players, roster),
  );
  return card;
}

/** Add a player from another age group (e.g. playing up). */
function guestPicker(session, players, roster) {
  const inRoster = new Set(roster.map((p) => p.id));
  const others = players.filter((p) => !p.archived && !inRoster.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!others.length) return null;
  const select = h('select', { class: 'select', 'aria-label': 'Add guest player' },
    h('option', { value: '' }, '+ Add player from another group…'),
    others.map((p) => h('option', { value: p.id }, `${p.name} (${p.ageGroup})`)));
  select.addEventListener('change', () => {
    if (!select.value) return;
    const fresh = store.get('sessions', session.id);
    store.upsert('sessions', setAttendance(fresh, select.value, 'present'));
  });
  return h('div', { style: { marginTop: 'var(--s-3)' } }, select);
}

function openDrillPicker(sessionId) {
  const session = store.get('sessions', sessionId);
  const state = { query: '', allAges: false, selected: new Set() };
  const listEl = h('div', { class: 'picker-list' });
  const addBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add');

  const refresh = () => {
    const all = store.getAll('drills');
    const list = filterDrills(all, { query: state.query, ageGroup: state.allAges ? '' : session.ageGroup });
    const already = new Set(store.get('sessions', sessionId)?.drillIds || []);
    listEl.replaceChildren(...(list.length
      ? list.map((d) => {
        const cb = h('input', { type: 'checkbox', checked: state.selected.has(d.id) });
        cb.addEventListener('change', () => {
          if (cb.checked) state.selected.add(d.id); else state.selected.delete(d.id);
          updateBtn();
        });
        return h('label', { class: 'picker-item' }, cb,
          h('span', { class: 'grow' },
            h('span', { class: 'title' }, d.name),
            h('span', { class: 'sub' }, [formatDuration(d.durationMin), d.equipment.join(', ')].filter(Boolean).join(' · '))),
          already.has(d.id) ? h('span', { class: 'badge badge-muted' }, 'In plan') : null);
      })
      : [h('p', { class: 'muted' }, all.length ? 'No drills match.' : 'Your drill library is empty.')]));
  };
  const updateBtn = () => {
    addBtn.textContent = state.selected.size ? `Add ${plural(state.selected.size, 'drill')}` : 'Add';
    addBtn.disabled = !state.selected.size;
  };

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search drills', 'aria-label': 'Search drills' });
  search.addEventListener('input', () => { state.query = search.value; refresh(); });
  const allAges = h('input', { type: 'checkbox' });
  allAges.addEventListener('change', () => { state.allAges = allAges.checked; refresh(); });

  const m = openModal({
    title: 'Add drills',
    body: [
      search,
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('label', { class: 'switch' }, allAges, `Show drills for all ages (not just ${session.ageGroup})`)),
      listEl,
    ],
    footer: h('div', { class: 'form-actions' },
      h('button', {
        class: 'btn left', type: 'button',
        onclick: () => openDrillForm(null, { onSaved: (d) => { state.selected.add(d.id); refresh(); updateBtn(); } }),
      }, icon('plus'), 'New drill'),
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'),
      addBtn),
  });

  addBtn.addEventListener('click', () => {
    const fresh = store.get('sessions', sessionId);
    // Keep the order the drills appear in the picker.
    const order = filterDrills(store.getAll('drills'), {}).map((d) => d.id).filter((x) => state.selected.has(x));
    if (!store.upsert('sessions', { ...fresh, drillIds: [...fresh.drillIds, ...order] })) return;
    toast(`Added ${plural(order.length, 'drill')}`);
    m.close();
  });

  refresh();
  updateBtn();
}
