// Writes that span more than one collection (cascades). Views call these
// instead of chaining store calls themselves, so the rules live in one place.

import * as store from './store.js';
import { todayISO, nowTime } from './utils/date.js';
import { upcomingForPlayer } from './models/bookings.js';

/** Delete a player and everything that references them. */
export function deletePlayer(playerId) {
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
  };
}

/**
 * Archive a player and cancel (delete) their 1-1 bookings that haven't
 * started yet. Past bookings — including unpaid ones — are kept as history.
 * @returns {boolean} whether it was saved
 */
export function archivePlayer(playerId, { today = todayISO(), time = nowTime() } = {}) {
  const player = store.get('players', playerId);
  if (!player) return false;
  const cancel = new Set(upcomingForPlayer(store.getAll('bookings'), playerId, today, time).map((b) => b.id));
  return store.batch(() => {
    store.upsert('players', { ...player, archived: true });
    if (cancel.size) store.removeWhere('bookings', (b) => cancel.has(b.id));
  });
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
