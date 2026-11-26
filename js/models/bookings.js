// 1-1 booking domain logic. Pure functions.

import { isISODate, isTime, timeToMinutes, minutesToTime, addDays, compareISO } from '../utils/date.js';

export const FOCUS_AREAS = [
  'Dribbling', 'Passing', 'First touch', 'Shooting', 'Finishing', 'Defending',
  'Goalkeeping', 'Weak foot', 'Speed & agility', 'Fitness', 'Game understanding',
];

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function normalizeBooking(input = {}) {
  const price = Number(input.price);
  const duration = Number(input.durationMin);
  return {
    ...(input.id ? { id: input.id } : {}),
    playerId: str(input.playerId),
    date: str(input.date),
    startTime: str(input.startTime),
    durationMin: Number.isFinite(duration) ? Math.round(duration) : 0,
    focusArea: str(input.focusArea),
    price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
    paid: Boolean(input.paid),
    location: str(input.location),
    notes: str(input.notes),
    // Safeguarding: who is responsible for the child during/around the session,
    // and how they are dropped off and collected.
    responsibleAdult: str(input.responsibleAdult),
    handover: str(input.handover),
    // 'cancelled' bookings stay as history but leave the calendar and totals.
    status: input.status === 'cancelled' ? 'cancelled' : 'booked',
    // Set when a paid booking is cancelled; cleared by markRefunded().
    refundDue: input.status === 'cancelled' && input.refundDue === true,
    refundedAt: typeof input.refundedAt === 'string' ? input.refundedAt : null,
  };
}

export const isCancelled = (b) => b.status === 'cancelled';
const active = (bookings) => bookings.filter((b) => !isCancelled(b));

/** Cancel a booking (pure). A paid one becomes a refund to settle. */
export function cancelBooking(b, at = new Date().toISOString()) {
  return { ...b, status: 'cancelled', refundDue: Boolean(b.paid), cancelledAt: at };
}

/** Settle a refund (pure). */
export function markRefunded(b, at = new Date().toISOString()) {
  return { ...b, refundDue: false, refundedAt: at };
}

/**
 * How a booking can be taken off the calendar from its edit form:
 * - 'cancel': paid and not started yet. The money is owed back, so it stays
 *   on record as cancelled with a refund due.
 * - 'delete-mistake': paid but already started/held. The session happened, so
 *   there is nothing to cancel or refund; deleting is only for a booking
 *   entered by mistake (no refund is recorded).
 * - 'delete': unpaid, nothing owed either way.
 */
export function removalAction(b, today, time) {
  if (!b.paid) return 'delete';
  return isUpcoming(b, today, time) ? 'cancel' : 'delete-mistake';
}

/** Total still to be refunded, rounded to cents. */
export function refundsDueTotal(bookings) {
  return Math.round(refundsDue(bookings).reduce((sum, b) => sum + (b.price || 0), 0) * 100) / 100;
}

/** A player's outstanding refunds (they block permanent delete). */
export function refundsDueForPlayer(bookings, playerId) {
  return refundsDue(bookings.filter((b) => b.playerId === playerId));
}

/** Cancelled bookings whose payment still has to be returned, oldest first. */
export function refundsDue(bookings) {
  return sortBookings(bookings.filter((b) => isCancelled(b) && b.refundDue));
}

/** Default "Responsible adult" for a 1-1: the player's parent contact. */
export function defaultResponsibleAdult(player) {
  if (!player?.parentName && !player?.parentPhone) return '';
  return [player.parentName, player.parentPhone && `(${player.parentPhone})`].filter(Boolean).join(' ');
}

export function validateBooking(b) {
  const errors = {};
  if (!b.playerId) errors.playerId = 'Pick a player';
  if (!isISODate(b.date)) errors.date = 'Pick a date';
  if (!isTime(b.startTime)) errors.startTime = 'Pick a start time';
  if (!(b.durationMin > 0)) errors.durationMin = 'Enter minutes';
  if (b.price < 0) errors.price = 'Price cannot be negative';
  return errors;
}

export function endTime(b) {
  return minutesToTime(timeToMinutes(b.startTime) + (b.durationMin || 0));
}

export function sortBookings(bookings) {
  return bookings.slice().sort((a, b) => compareISO(a.date, b.date) || a.startTime.localeCompare(b.startTime));
}

/** Calendar bookings in a date range; cancelled ones are left out. */
export function bookingsInRange(bookings, fromIso, toIso) {
  return sortBookings(active(bookings).filter((b) => b.date >= fromIso && b.date <= toIso));
}

export function bookingsInWeek(bookings, weekStartIso) {
  return bookingsInRange(bookings, weekStartIso, addDays(weekStartIso, 6));
}

export function groupByDay(bookings, days) {
  const map = Object.fromEntries(days.map((d) => [d, []]));
  for (const b of sortBookings(bookings)) if (map[b.date]) map[b.date].push(b);
  return map;
}

/** Money/count totals. Cancelled bookings never count (refunds are tracked separately). */
export function totals(bookings) {
  let total = 0; let paid = 0; let paidCount = 0;
  bookings = active(bookings);
  for (const b of bookings) {
    total += b.price || 0;
    if (b.paid) { paid += b.price || 0; paidCount++; }
  }
  return {
    count: bookings.length,
    paidCount,
    unpaidCount: bookings.length - paidCount,
    total: Math.round(total * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    unpaid: Math.round((total - paid) * 100) / 100,
  };
}

/** Bookings for the same date whose time ranges overlap `b` (excluding itself). */
export function findClashes(bookings, b) {
  const start = timeToMinutes(b.startTime);
  const end = start + (b.durationMin || 0);
  return active(bookings).filter((o) => o.id !== b.id && o.date === b.date && (() => {
    const s = timeToMinutes(o.startTime);
    const e = s + (o.durationMin || 0);
    return s < end && start < e;
  })());
}

/** Not started yet: a later date, or later today. */
export function isUpcoming(b, today, time) {
  return b.date > today || (b.date === today && b.startTime > time);
}

export function upcomingForPlayer(bookings, playerId, today, time) {
  return sortBookings(active(bookings).filter((b) => b.playerId === playerId && isUpcoming(b, today, time)));
}

/** Cancelled bookings of a player that would still be in the future (e.g. to mention on restore). */
export function cancelledUpcomingForPlayer(bookings, playerId, today, time) {
  return sortBookings(bookings.filter((b) => b.playerId === playerId && isCancelled(b) && isUpcoming(b, today, time)));
}

/** Restore toast: archiving cancelled their upcoming 1-1s, and restoring doesn't bring them back. */
export function restoredMessage(name, cancelledCount) {
  if (!cancelledCount) return `${name} restored to the roster`;
  const n = cancelledCount === 1 ? '1 cancelled 1-1 is' : `${cancelledCount} cancelled 1-1s are`;
  return `${name} restored. Their ${n} not restored: rebook on the 1-1s page if needed.`;
}

export function unpaidBookings(bookings, today) {
  return sortBookings(active(bookings).filter((b) => !b.paid && b.date <= today));
}
