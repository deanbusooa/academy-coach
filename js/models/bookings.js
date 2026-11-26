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
  };
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

export function bookingsInRange(bookings, fromIso, toIso) {
  return sortBookings(bookings.filter((b) => b.date >= fromIso && b.date <= toIso));
}

export function bookingsInWeek(bookings, weekStartIso) {
  return bookingsInRange(bookings, weekStartIso, addDays(weekStartIso, 6));
}

export function groupByDay(bookings, days) {
  const map = Object.fromEntries(days.map((d) => [d, []]));
  for (const b of sortBookings(bookings)) if (map[b.date]) map[b.date].push(b);
  return map;
}

export function totals(bookings) {
  let total = 0; let paid = 0; let paidCount = 0;
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
  return bookings.filter((o) => o.id !== b.id && o.date === b.date && (() => {
    const s = timeToMinutes(o.startTime);
    const e = s + (o.durationMin || 0);
    return s < end && start < e;
  })());
}

export function unpaidBookings(bookings, today) {
  return sortBookings(bookings.filter((b) => !b.paid && b.date <= today));
}
