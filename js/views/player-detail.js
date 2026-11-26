// Player profile: contact, attendance, bookings, latest ratings.

import * as store from '../store.js';
import { h, setTitle } from '../utils/dom.js';
import { href } from '../router.js';
import { icon } from '../ui/icons.js';
import { formatMoney, round1, plural } from '../utils/format.js';
import { todayISO, formatDate, relativeDay, localDateOf } from '../utils/date.js';
import { telHref } from '../models/players.js';
import { playerAttendance } from '../models/sessions.js';
import { sortBookings, totals, endTime } from '../models/bookings.js';
import { ratingsForPlayer, latestScores, average, SKILLS } from '../models/ratings.js';
import { openPlayerForm } from './players.js';
import { openBookingForm } from './bookings.js';
import { backLink, avatar, emptyState } from './shared.js';

export function render(container, { id }) {
  const player = store.get('players', id);
  if (!player) {
    setTitle('Player');
    container.append(backLink(href('/players'), 'Players'),
      emptyState({ iconName: 'players', text: 'This player no longer exists.' }));
    return;
  }
  setTitle(player.name);

  const settings = store.getSettings();
  const today = todayISO();
  const att = playerAttendance(store.getAll('sessions'), player, today);
  const bookings = sortBookings(store.getAll('bookings').filter((b) => b.playerId === id));
  const upcoming = bookings.filter((b) => b.date >= today);
  const owed = totals(bookings.filter((b) => b.date <= today));
  const ratings = ratingsForPlayer(store.getAll('ratings'), id);
  const latest = latestScores(ratings);
  const avg = average(latest);

  const tel = telHref(player.parentPhone);

  container.append(
    backLink(href('/players'), 'Players'),
    h('div', { class: 'profile-head' },
      avatar(player.name),
      h('div', { class: 'grow' },
        h('h2', {}, player.name),
        h('div', { class: 'row' },
          h('span', { class: 'badge' }, player.ageGroup),
          player.position ? h('span', { class: 'badge badge-muted' }, player.position) : null)),
      h('button', { class: 'btn btn-sm', onclick: () => openPlayerForm(player) }, icon('edit'), 'Edit')),

    h('div', { class: 'quick-actions' },
      h('a', { class: 'btn btn-pitch', href: href(`/progress/${id}`) }, icon('progress'), 'Progress'),
      h('button', { class: 'btn', onclick: () => openBookingForm({ playerId: id }) }, icon('calendar'), 'Book 1-1'),
      tel ? h('a', { class: 'btn', href: tel }, icon('phone'), 'Call parent') : null),

    h('div', { class: 'stats' },
      stat(att.pct === null ? '—' : `${att.pct}%`, 'Attendance', att.pct !== null && att.pct < 60 ? 'bad' : ''),
      stat(`${att.attended}/${att.total}`, 'Sessions'),
      stat(avg === null ? '—' : round1(avg).toFixed(1), 'Avg rating'),
      stat(formatMoney(owed.unpaid, settings.currency), 'Unpaid', owed.unpaid > 0 ? 'bad' : 'ok')),
  );

  // Contact
  container.append(h('section', { class: 'card' },
    h('h3', {}, 'Parent contact'),
    player.parentName || player.parentPhone || player.parentEmail
      ? h('dl', { class: 'kv' },
        player.parentName ? [h('dt', {}, 'Name'), h('dd', {}, player.parentName)] : null,
        player.parentPhone ? [h('dt', {}, 'Phone'), h('dd', {},
          tel ? h('a', { href: tel }, player.parentPhone) : player.parentPhone)] : null,
        player.parentEmail ? [h('dt', {}, 'Email'), h('dd', {},
          h('a', { href: `mailto:${encodeURIComponent(player.parentEmail)}` }, player.parentEmail))] : null)
      : h('p', { class: 'muted' }, 'No contact details yet.'),
    player.notes ? [h('h3', { style: { marginTop: 'var(--s-4)' } }, 'Notes'), h('p', { class: 'pre-line' }, player.notes)] : null,
  ));

  // Latest skills
  container.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, 'Latest skills'),
      h('a', { class: 'btn btn-sm', href: href(`/progress/${id}`) }, 'View trend')),
    ratings.length
      ? h('div', { class: 'skill-bars' }, SKILLS.map((s) => skillBar(s, latest[s.key])))
      : h('p', { class: 'muted' }, 'Not rated yet.'),
  ));

  // Upcoming 1-1s
  container.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, 'Upcoming 1-1s'),
      h('span', { class: 'muted' }, plural(bookings.length, 'booking'), ' total')),
    upcoming.length
      ? h('ul', { class: 'list' }, upcoming.slice(0, 5).map((b) => h('li', {},
        h('button', { class: 'list-item', type: 'button', onclick: () => openBookingForm(b) },
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, `${relativeDay(b.date, today)} · ${b.startTime}–${endTime(b)}`),
            h('div', { class: 'sub' }, b.focusArea || 'General')),
          h('span', { class: ['badge', b.paid ? 'badge-ok' : 'badge-warn'] }, b.paid ? 'Paid' : formatMoney(b.price, settings.currency))))))
      : h('p', { class: 'muted' }, 'None booked.'),
  ));

  container.append(h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } },
    `Added ${formatDate(localDateOf(player.createdAt))}`));
}

function stat(value, label, tone = '') {
  return h('div', { class: ['stat', tone] }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
}

export function skillBar(skill, value) {
  const pct = value ? (value / 5) * 100 : 0;
  return h('div', { class: 'skill-bar' },
    h('span', { class: 'skill-name' }, skill.label),
    h('span', { class: 'skill-track' }, h('span', { class: 'skill-fill', style: { width: `${pct}%`, background: skill.color } })),
    h('span', { class: 'skill-value' }, value ?? '—'));
}
