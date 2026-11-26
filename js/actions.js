// Writes that span more than one collection (cascades). Views call these
// instead of chaining store calls themselves, so the rules live in one place.

import * as store from './store.js';
import { todayISO, nowTime } from './utils/date.js';
import { upcomingForPlayer, cancelBooking, isCancelled, refundsDueForPlayer } from './models/bookings.js';
import { ratingOn } from './models/ratings.js';
import { archivedBefore, monthsAgo } from './models/players.js';

/**
 * Delete a player and everything that references them.
 * Refused (returns false, nothing deleted) while the player has refunds due:
 * deleting would erase the record of money owed back. Mark them refunded first.
 */
export function deletePlayer(playerId) {
  if (refundsDueForPlayer(store.getAll('bookings'), playerId).length) return false;
  return store.batch(() => {
    store.remove('players', playerId);
    store.removeWhere('ratings', (r) => r.playerId === playerId);
    store.removeWhere('bookings', (b) => b.playerId === playerId);
    for (const s of store.getAll('sessions')) {
      if (s.attendance && playerId in s.attendance) {
        const attendance = { ...s.attendance };
        delete attendance[playerId];
        store.upsert('sessions', { ...s, attendance });
      }
    }
  });
}

/** What deleting a player would remove — for the confirm dialog. */
export function playerDependents(playerId) {
  return {
    ratings: store.getAll('ratings').filter((r) => r.playerId === playerId).length,
    bookings: store.getAll('bookings').filter((b) => b.playerId === playerId).length,
    refundsDue: refundsDueForPlayer(store.getAll('bookings'), playerId),
  };
}

/**
 * Archive a player and cancel their 1-1 bookings that haven't started yet:
 * they get status 'cancelled' (and refundDue if paid) and leave the calendar
 * and totals, but stay on record. Past bookings are untouched.
 * @returns {boolean} whether it was saved
 */
export function archivePlayer(playerId, { today = todayISO(), time = nowTime() } = {}) {
  const player = store.get('players', playerId);
  if (!player) return false;
  const upcoming = upcomingForPlayer(store.getAll('bookings'), playerId, today, time);
  return store.batch(() => {
    store.upsert('players', { ...player, archived: true, archivedAt: new Date().toISOString() });
    for (const b of upcoming) store.upsert('bookings', cancelBooking(b));
  });
}

/**
 * Save a rating, keeping one per player per date: if another rating exists
 * for that player and date, it is replaced (same id) instead of adding a
 * second point. Editing a rating onto another one's date merges them.
 * Older duplicates for that date are removed too.
 * @returns {{ saved: object, replaced: boolean } | null} null if the save failed
 */
export function saveRating(rec) {
  const all = store.getAll('ratings');
  const sameDay = all.filter((r) => r.playerId === rec.playerId && r.date === rec.date && r.id !== rec.id);
  if (!sameDay.length) {
    const saved = store.upsert('ratings', rec);
    return saved ? { saved, replaced: false } : null;
  }
  const keep = ratingOn(all, rec.playerId, rec.date, rec.id);
  let saved = null;
  const ok = store.batch(() => {
    saved = store.upsert('ratings', { ...rec, id: keep.id, createdAt: keep.createdAt });
    const drop = new Set(sameDay.map((r) => r.id).filter((id) => id !== keep.id));
    if (rec.id && rec.id !== keep.id) drop.add(rec.id);
    if (drop.size) store.removeWhere('ratings', (r) => drop.has(r.id));
  });
  return ok ? { saved: store.get('ratings', keep.id), replaced: true } : null;
}

/**
 * Cancel one booking (stays on record, leaves the calendar/totals; refundDue
 * if it was paid). @returns the saved booking, or null if missing/not saved.
 */
export function cancelBookingById(bookingId) {
  const b = store.get('bookings', bookingId);
  if (!b || isCancelled(b)) return null;
  return store.upsert('bookings', cancelBooking(b));
}

/**
 * Permanently delete archived players archived more than `months` ago, with
 * their ratings, bookings and attendance. Players with refunds due are
 * skipped (same rule as deletePlayer). All-or-nothing save.
 * @returns {{ ok: boolean, deleted: string[], skipped: string[] }} player names
 */
export function deleteArchivedOlderThan(months, now = new Date()) {
  const candidates = archivedBefore(store.getAll('players'), monthsAgo(months, now));
  const all = store.getAll('bookings');
  const skipped = candidates.filter((p) => refundsDueForPlayer(all, p.id).length);
  const toDelete = candidates.filter((p) => !skipped.includes(p));
  const ok = !toDelete.length || store.batch(() => { for (const p of toDelete) deletePlayer(p.id); });
  return { ok, deleted: ok ? toDelete.map((p) => p.name) : [], skipped: skipped.map((p) => p.name) };
}

/** Delete a drill and remove it from any session plans. */
export function deleteDrill(drillId) {
  return store.batch(() => {
    store.remove('drills', drillId);
    for (const s of store.getAll('sessions')) {
      if (s.drillIds?.includes(drillId)) {
        store.upsert('sessions', { ...s, drillIds: s.drillIds.filter((id) => id !== drillId) });
      }
    }
  });
}

export function sessionsUsingDrill(drillId) {
  return store.getAll('sessions').filter((s) => s.drillIds?.includes(drillId)).length;
}

/** Rename an age group everywhere it is used. */
export function renameAgeGroup(oldName, newName) {
  return store.batch(() => {
    const settings = store.getSettings();
    store.updateSettings({ ageGroups: settings.ageGroups.map((g) => (g === oldName ? newName : g)) });
    for (const p of store.getAll('players')) if (p.ageGroup === oldName) store.upsert('players', { ...p, ageGroup: newName });
    for (const s of store.getAll('sessions')) if (s.ageGroup === oldName) store.upsert('sessions', { ...s, ageGroup: newName });
    for (const d of store.getAll('drills')) {
      if (d.ageGroups?.includes(oldName)) store.upsert('drills', { ...d, ageGroups: d.ageGroups.map((g) => (g === oldName ? newName : g)) });
    }
  });
}
