// Group sessions list: upcoming/past, filter by age group, plan new.

import * as store from '../store.js';
import { h, add, setTitle } from '../utils/dom.js';
import { href, navigate } from '../router.js';
import { openFormModal, confirmDialog } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { formatDuration, plural } from '../utils/format.js';
import { todayISO, relativeDay, formatDate } from '../utils/date.js';
import {
  normalizeSession, validateSession, splitUpcomingPast, totalDuration,
  attendanceSummary, sessionRoster,
} from '../models/sessions.js';
import { pageHead, emptyState, fab, filterChips, ageGroupOptions, listItemLink } from './shared.js';

const ui = { tab: 'upcoming', ageGroup: '' };

export function render(container) {
  setTitle('Sessions');
  const sessions = store.getAll('sessions');
  const drills = store.getAll('drills');
  const players = store.getAll('players');
  const settings = store.getSettings();
  const today = todayISO();

  container.append(pageHead('Group sessions'));

  if (!sessions.length) {
    container.append(
      emptyState({
        iconName: 'sessions',
        text: 'Plan your first group session: pick a date, age group and drills, then take the register on the pitch.',
        action: h('button', { class: 'btn btn-primary', onclick: () => openSessionForm() }, 'Plan a session'),
      }),
      fab('Plan session', () => openSessionForm()),
    );
    return;
  }

  const filtered = ui.ageGroup ? sessions.filter((s) => s.ageGroup === ui.ageGroup) : sessions;
  const { upcoming, past } = splitUpcomingPast(filtered, today);
  const rerender = () => { container.replaceChildren(); render(container); };
  const usedGroups = settings.ageGroups.filter((g) => sessions.some((s) => s.ageGroup === g));

  add(container,
    h('div', { class: 'segmented', role: 'tablist' },
      ['upcoming', 'past'].map((t) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(ui.tab === t),
        onclick: () => { ui.tab = t; rerender(); },
      }, t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`))),
    usedGroups.length > 1 ? filterChips({
      label: 'Age group', value: ui.ageGroup,
      options: usedGroups.map((g) => ({ value: g, label: g })),
      onChange: (v) => { ui.ageGroup = v; rerender(); },
    }) : null,
  );

  const list = ui.tab === 'upcoming' ? upcoming : past;
  container.append(list.length
    ? h('ul', { class: 'list' }, list.map((s) => sessionRow(s, { drills, players, today })))
    : h('p', { class: 'empty' }, ui.tab === 'upcoming' ? 'Nothing planned. Tap + to plan a session.' : 'No past sessions.'));

  container.append(fab('Plan session', () => openSessionForm()));
}

function sessionRow(s, { drills, players, today }) {
  const mins = totalDuration(s, drills);
  const sum = attendanceSummary(s, sessionRoster(players, s));
  const marked = sum.present + sum.late + sum.absent;
  return listItemLink(href(`/sessions/${s.id}`),
    h('div', { class: 'date-block' },
      h('span', { class: 'd' }, s.date.slice(8, 10)),
      h('span', { class: 'm' }, formatDate(s.date, { month: 'short' }))),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, s.title || `${s.ageGroup} training`),
      h('div', { class: 'sub' }, [
        relativeDay(s.date, today),
        s.time,
        s.location,
        s.drillIds.length ? `${plural(s.drillIds.length, 'drill')} · ${formatDuration(mins)}` : 'No drills yet',
      ].filter(Boolean).join(' · '))),
    h('div', { class: 'row', style: { flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } },
      h('span', { class: 'badge' }, s.ageGroup),
      marked ? h('span', { class: 'badge badge-ok' }, `${sum.present + sum.late}/${sum.total}`) : null));
}

export function openSessionForm(session = null) {
  const settings = store.getSettings();
  const isEdit = Boolean(session);
  openFormModal({
    title: isEdit ? 'Edit session' : 'Plan session',
    values: session || { date: todayISO(), time: '17:00', ageGroup: ui.ageGroup || '' },
    fields: [
      [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'time', label: 'Start time', type: 'time' },
      ],
      [
        { name: 'ageGroup', label: 'Age group', type: 'select', required: true, options: ageGroupOptions(settings, session?.ageGroup) },
        { name: 'location', label: 'Location', placeholder: 'e.g. Pitch 2' },
      ],
      { name: 'title', label: 'Theme / title', placeholder: 'e.g. Playing out from the back' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ],
    normalize: normalizeSession,
    validate: validateSession,
    saveLabel: isEdit ? 'Save' : 'Create & add drills',
    onSave: (rec) => {
      const saved = store.upsert('sessions', rec);
      if (!saved) return false;
      if (!isEdit) navigate(`/sessions/${saved.id}`);
      return true;
    },
    savedMessage: isEdit ? 'Session updated' : 'Session created',
    onDelete: isEdit ? async () => {
      const ok = await confirmDialog({
        title: 'Delete this session?',
        message: 'The plan and attendance register will be removed.',
        confirmLabel: 'Delete session',
        danger: true,
      });
      if (!ok) return false;
      if (!store.remove('sessions', session.id)) return false;
      toast('Session deleted');
      navigate('/sessions');
      return true;
    } : null,
  });
}
