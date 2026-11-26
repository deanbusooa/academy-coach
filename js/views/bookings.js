// 1-1 bookings: weekly calendar, paid toggle, week totals, outstanding payments.

import * as store from '../store.js';
import { h, setTitle } from '../utils/dom.js';
import { href, navigate } from '../router.js';
import { openFormModal, confirmDialog } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { formatMoney, formatDuration, plural } from '../utils/format.js';
import {
  todayISO, nowTime, startOfWeek, weekDays, addDays, isISODate, formatWeekRange, formatDate, formatDayName, relativeDay,
} from '../utils/date.js';
import {
  FOCUS_AREAS, normalizeBooking, validateBooking, bookingsInWeek, groupByDay, totals, endTime,
  findClashes, unpaidBookings, refundsDue, markRefunded, removalAction, refundsDueTotal, defaultResponsibleAdult,
} from '../models/bookings.js';
import { pageHead, emptyState, fab, playerOptions } from './shared.js';
import { cancelBookingById } from '../actions.js';

export function render(container, _params, query) {
  setTitle('1-1 Sessions');
  const today = todayISO();
  const weekStart = startOfWeek(isISODate(query.week) ? query.week : today);
  const days = weekDays(weekStart);
  const settings = store.getSettings();
  const players = store.getAll('players');
  const playerById = new Map(players.map((p) => [p.id, p]));
  const all = store.getAll('bookings');
  const week = bookingsInWeek(all, weekStart);
  const byDay = groupByDay(week, days);
  const t = totals(week);
  const isThisWeek = weekStart === startOfWeek(today);

  container.append(
    pageHead('1-1 sessions'),
    h('div', { class: 'week-nav' },
      h('a', { class: 'btn btn-icon', href: href('/bookings', { week: addDays(weekStart, -7) }), 'aria-label': 'Previous week' }, icon('chevron-left')),
      h('div', { class: 'week-label' },
        h('strong', {}, formatWeekRange(weekStart)),
        isThisWeek ? h('span', { class: 'badge' }, 'This week') : h('a', { href: href('/bookings'), class: 'btn btn-sm btn-ghost' }, 'Today')),
      h('a', { class: 'btn btn-icon', href: href('/bookings', { week: addDays(weekStart, 7) }), 'aria-label': 'Next week' }, icon('chevron-right'))),
    h('div', { class: 'stats' },
      stat(String(t.count), 'Booked'),
      stat(formatMoney(t.total, settings.currency), 'Week value'),
      stat(formatMoney(t.paid, settings.currency), 'Paid', 'ok'),
      stat(formatMoney(t.unpaid, settings.currency), 'Unpaid', t.unpaid > 0 ? 'bad' : '')),
  );

  if (!players.length) {
    container.append(emptyState({
      iconName: 'calendar',
      text: 'Add players first, then book their 1-1 sessions here.',
      action: h('a', { class: 'btn btn-primary', href: href('/players') }, 'Go to players'),
    }));
    return;
  }

  container.append(h('div', { class: 'week' }, days.map((d) => h('section', { class: ['day', d === today && 'is-today', d < today && 'is-past'] },
    h('header', { class: 'day-head' },
      h('span', { class: 'day-name' }, formatDayName(d)),
      h('span', { class: 'day-date' }, formatDate(d, { day: 'numeric', month: 'short' })),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', type: 'button', 'aria-label': `Add booking on ${formatDate(d)}`,
        onclick: () => openBookingForm({ date: d }) }, icon('plus'))),
    byDay[d].length
      ? byDay[d].map((b) => bookingCard(b, playerById.get(b.playerId), settings))
      : h('p', { class: 'day-empty' }, 'Free')))));

  // Outstanding payments across all weeks.
  const owed = unpaidBookings(all, today);
  if (owed.length) {
    const ot = totals(owed);
    container.append(h('section', { class: 'card', style: { marginTop: 'var(--s-4)' } },
      h('div', { class: 'card-head' },
        h('h3', {}, 'Awaiting payment'),
        h('span', { class: 'badge badge-bad' }, formatMoney(ot.unpaid, settings.currency))),
      h('ul', { class: 'list' }, owed.map((b) => {
        const p = playerById.get(b.playerId);
        return h('li', {}, h('div', { class: 'list-item' },
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, p?.name || 'Unknown player'),
            h('div', { class: 'sub' }, `${relativeDay(b.date, today)} · ${b.startTime} · ${b.focusArea || 'General'}`)),
          h('button', { class: 'btn btn-sm btn-pitch', type: 'button', onclick: () => togglePaid(b) },
            icon('check'), `Paid ${formatMoney(b.price, settings.currency)}`)));
      }))));
  }

  // Paid sessions cancelled by archiving a player: money to hand back.
  const refunds = refundsDue(all);
  if (refunds.length) {
    const due = refundsDueTotal(all);
    container.append(h('section', { class: 'card refunds-card', style: { marginTop: 'var(--s-4)' } },
      h('div', { class: 'card-head' },
        h('h3', {}, 'Refunds due'),
        h('span', { class: 'badge badge-warn' }, formatMoney(due, settings.currency))),
      h('p', { class: 'muted hint-line' }, 'Paid 1-1s that were cancelled. Mark each one once you have paid the money back.'),
      h('ul', { class: 'list' }, refunds.map((b) => {
        const p = playerById.get(b.playerId);
        return h('li', {}, h('div', { class: 'list-item' },
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, `${p?.name || 'Unknown player'} · ${formatMoney(b.price, settings.currency)}`),
            h('div', { class: 'sub' }, `Cancelled: ${formatDate(b.date)} ${b.startTime} · ${b.focusArea || 'General'}`)),
          h('button', {
            class: 'btn btn-sm', type: 'button', dataset: { focusKey: `refund-${b.id}` },
            'aria-label': `Mark refunded: ${p?.name || 'player'}, ${formatDate(b.date)}`,
            onclick: () => { if (store.upsert('bookings', markRefunded(b))) toast('Refund recorded'); },
          }, icon('check'), 'Mark refunded')));
      }))));
  }

  container.append(fab('Add booking', () => openBookingForm({ date: days.includes(today) ? today : weekStart })));
}

function stat(value, label, tone = '') {
  return h('div', { class: ['stat', tone] }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
}

function bookingCard(b, player, settings) {
  return h('article', { class: ['booking', b.paid ? 'is-paid' : 'is-unpaid'] },
    h('button', { class: 'booking-main', type: 'button', onclick: () => openBookingForm(b), 'aria-label': `Edit booking for ${player?.name || 'player'}` },
      h('span', { class: 'booking-time' }, `${b.startTime}–${endTime(b)}`),
      h('span', { class: 'booking-player' }, player?.name || 'Unknown player'),
      h('span', { class: 'booking-focus' }, [b.focusArea || 'General', b.location].filter(Boolean).join(' · '))),
    h('button', {
      class: ['paid-toggle', b.paid && 'on'], type: 'button', 'aria-pressed': String(b.paid),
      dataset: { focusKey: `paid-${b.id}` },
      'aria-label': b.paid ? 'Mark as unpaid' : 'Mark as paid',
      onclick: () => togglePaid(b),
    }, b.paid ? icon('check') : null, b.paid ? 'Paid' : formatMoney(b.price, settings.currency)));
}

function togglePaid(b) {
  const saved = store.upsert('bookings', { ...b, paid: !b.paid });
  if (saved) toast(saved.paid ? 'Marked paid' : 'Marked unpaid');
}

/** Add (pass defaults like { date } or { playerId }) or edit (pass a stored booking). */
export function openBookingForm(input = {}) {
  const settings = store.getSettings();
  const isEdit = Boolean(input.id);
  const players = store.getAll('players');
  if (!isEdit && !players.some((p) => !p.archived)) { toast('Add a player first', { type: 'error' }); return; }

  const values = isEdit ? input : {
    date: todayISO(),
    startTime: '16:00',
    durationMin: settings.defaultDuration,
    price: settings.defaultPrice,
    paid: false,
    ...input,
  };
  const playerById = new Map(players.map((p) => [p.id, p]));
  if (!isEdit && !values.responsibleAdult) values.responsibleAdult = defaultResponsibleAdult(playerById.get(values.playerId));

  const m = openFormModal({
    title: isEdit ? 'Edit 1-1 booking' : 'New 1-1 booking',
    values,
    fields: [
      { name: 'playerId', label: 'Player', type: 'select', required: true, options: playerOptions(players, values.playerId) },
      [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'startTime', label: 'Start', type: 'time', required: true },
        { name: 'durationMin', label: 'Minutes', type: 'number', min: 5, step: 5, inputmode: 'numeric', required: true },
      ],
      [
        { name: 'focusArea', label: 'Focus area', suggestions: FOCUS_AREAS, placeholder: 'e.g. Weak foot' },
        { name: 'price', label: `Price (${settings.currency})`, type: 'number', min: 0, step: '0.01' },
      ],
      { name: 'location', label: 'Location', placeholder: 'Optional' },
      {
        name: 'responsibleAdult', label: 'Responsible adult',
        placeholder: 'Name and phone', hint: 'Who is responsible for the player around this session. Defaults to the parent contact.',
      },
      {
        name: 'handover', label: 'Drop-off / collection', type: 'textarea', rows: 2,
        placeholder: 'e.g. Dropped off and collected by mum at the car park',
      },
      { name: 'paid', label: 'Paid', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ],
    before: h('p', { class: 'safeguarding-note' }, icon('warning', 'note-icon'),
      "The academy's safeguarding policy applies to every 1-1 session."),
    normalize: normalizeBooking,
    validate: validateBooking,
    savedMessage: null,
    onSave: (rec) => {
      const clashes = findClashes(store.getAll('bookings'), rec);
      const saved = store.upsert('bookings', rec);
      if (!saved) return false;
      // A clash is a heads-up, not a failure: the booking saved. Info style + warning icon.
      if (clashes.length) {
        toast(`Saved — note: overlaps ${plural(clashes.length, 'other booking')}`, { icon: 'warning', duration: 4000 });
      } else {
        toast(isEdit ? 'Booking updated' : `Booked ${formatDuration(saved.durationMin)} on ${formatDate(saved.date)}`);
      }
      // On the calendar, jump to the saved booking's week (no-op if already there).
      if (location.hash.startsWith('#/bookings')) navigate('/bookings', { week: startOfWeek(saved.date) });
      return true;
    },
    // Paid: the money is owed back, so cancel (kept on record, refund due)
    // instead of deleting. Unpaid: plain delete. Based on the saved booking.
    leftAction: !isEdit ? null : bookingLeftAction(input, settings),
  });

  const form = m.el.querySelector('form');
  const adult = form.elements.responsibleAdult;
  let autoAdult = adult.value;
  form.elements.playerId.addEventListener('change', (e) => {
    if (adult.value !== autoAdult) return; // coach typed their own: leave it
    autoAdult = defaultResponsibleAdult(playerById.get(e.target.value));
    adult.value = autoAdult;
  });
}

/** Footer action for an existing booking; see removalAction() for the rules. */
function bookingLeftAction(input, settings) {
  const kind = removalAction(input, todayISO(), nowTime());
  if (kind === 'delete-mistake') {
    // Secondary (not red): the session already happened, so this is only for fixing a mistake.
    return {
      label: 'Delete (entered by mistake)', icon: 'trash',
      run: async () => {
        const ok = await confirmDialog({
          title: 'Delete this paid 1-1?',
          message: `Only do this if the booking was entered by mistake. It has already taken place, so it can't be cancelled.

It will be removed completely and no refund is recorded. The ${formatMoney(input.price, settings.currency)} payment will no longer appear anywhere.`,
          confirmLabel: 'Delete, no refund',
          cancelLabel: 'Keep booking',
          danger: true,
        });
        if (!ok) return false;
        if (!store.remove('bookings', input.id)) return false;
        toast('Booking deleted (no refund recorded)');
        return true;
      },
    };
  }
  return kind === 'cancel'
    ? {
      label: 'Cancel (refund due)', icon: 'x', danger: true,
      run: async () => {
        const ok = await confirmDialog({
          title: 'Cancel this paid 1-1?',
          message: `It comes off the calendar and ${formatMoney(input.price, settings.currency)} is added to Refunds due on the 1-1s page.`,
          confirmLabel: 'Cancel booking',
          cancelLabel: 'Keep booking',
          danger: true,
        });
        if (!ok) return false;
        if (!cancelBookingById(input.id)) return false;
        toast(`Booking cancelled. ${formatMoney(input.price, settings.currency)} refund due`);
        return true;
      },
    }
    : {
      label: 'Delete', icon: 'trash', danger: true,
      run: async () => {
        const ok = await confirmDialog({ title: 'Delete this booking?', confirmLabel: 'Delete', danger: true });
        if (!ok) return false;
        if (!store.remove('bookings', input.id)) return false;
        toast('Booking deleted');
        return true;
      },
    };
}
