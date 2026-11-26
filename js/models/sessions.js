// Group session + attendance domain logic. Pure functions.

import { isISODate, isTime, compareISO, localDateOf } from '../utils/date.js';
import { sortPlayers } from './players.js';

export const ATTENDANCE = ['present', 'late', 'absent'];
export const ATTENDANCE_LABEL = { present: 'Present', late: 'Late', absent: 'Absent' };

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function normalizeSession(input = {}) {
  return {
    ...(input.id ? { id: input.id } : {}),
    date: str(input.date),
    time: str(input.time),
    ageGroup: str(input.ageGroup),
    location: str(input.location),
    title: str(input.title),
    drillIds: Array.isArray(input.drillIds) ? input.drillIds.filter((id) => typeof id === 'string' && id) : [],
    attendance: cleanAttendance(input.attendance),
    notes: str(input.notes),
  };
}

function cleanAttendance(att) {
  if (!att || typeof att !== 'object' || Array.isArray(att)) return {};
  return Object.fromEntries(Object.entries(att).filter(([, v]) => ATTENDANCE.includes(v)));
}

export function validateSession(s) {
  const errors = {};
  if (!isISODate(s.date)) errors.date = 'Pick a date';
  if (s.time && !isTime(s.time)) errors.time = 'Use HH:MM';
  if (!s.ageGroup) errors.ageGroup = 'Pick an age group';
  return errors;
}

/** Tap cycle: unmarked → present → late → absent → unmarked */
export function nextAttendance(current) {
  if (!current) return 'present';
  const i = ATTENDANCE.indexOf(current);
  return i === -1 || i === ATTENDANCE.length - 1 ? null : ATTENDANCE[i + 1];
}

export function setAttendance(session, playerId, status) {
  const attendance = { ...session.attendance };
  if (status) attendance[playerId] = status; else delete attendance[playerId];
  return { ...session, attendance };
}

export function markAll(session, playerIds, status = 'present') {
  const attendance = { ...session.attendance };
  for (const id of playerIds) attendance[id] = status;
  return { ...session, attendance };
}

/**
 * Players to show on the register: everyone in the age group, plus anyone
 * from another group who already has a mark (e.g. a guest player).
 */
export function sessionRoster(players, session) {
  const marked = new Set(Object.keys(session.attendance || {}));
  return sortPlayers(players.filter((p) => p.ageGroup === session.ageGroup || marked.has(p.id)));
}

export function attendanceSummary(session, roster) {
  const out = { present: 0, late: 0, absent: 0, unmarked: 0, total: roster.length };
  for (const p of roster) {
    const s = session.attendance?.[p.id];
    if (s && out[s] !== undefined) out[s]++; else out.unmarked++;
  }
  return out;
}

export function sessionDrills(session, drills) {
  const byId = new Map(drills.map((d) => [d.id, d]));
  return session.drillIds.map((id) => byId.get(id)).filter(Boolean);
}

export function totalDuration(session, drills) {
  return sessionDrills(session, drills).reduce((sum, d) => sum + (Number(d.durationMin) || 0), 0);
}

export function moveDrill(session, index, delta) {
  const ids = session.drillIds.slice();
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return session;
  [ids[index], ids[to]] = [ids[to], ids[index]];
  return { ...session, drillIds: ids };
}

export function removeDrillAt(session, index) {
  return { ...session, drillIds: session.drillIds.filter((_, i) => i !== index) };
}

export function sortSessions(sessions, dir = 'asc') {
  const m = dir === 'asc' ? 1 : -1;
  return sessions.slice().sort((a, b) => m * (compareISO(a.date, b.date) || (a.time || '').localeCompare(b.time || '')));
}

export function splitUpcomingPast(sessions, today) {
  return {
    upcoming: sortSessions(sessions.filter((s) => s.date >= today), 'asc'),
    past: sortSessions(sessions.filter((s) => s.date < today), 'desc'),
  };
}

/**
 * Attendance record for one player. Counts sessions up to `today` where the
 * register was taken and either the player was marked, or they were eligible
 * (same age group) AND had already joined (session on/after their createdAt local date).
 * An explicit mark always counts, even on a session dated before they were added.
 */
export function playerAttendance(sessions, player, today) {
  const joined = localDateOf(player.createdAt);
  const relevant = sessions.filter((s) => {
    if (s.date > today || Object.keys(s.attendance || {}).length === 0) return false;
    if (s.attendance?.[player.id]) return true;
    return s.ageGroup === player.ageGroup && (!joined || s.date >= joined);
  });
  let attended = 0;
  for (const s of relevant) {
    const st = s.attendance?.[player.id];
    if (st === 'present' || st === 'late') attended++;
  }
  return {
    attended,
    total: relevant.length,
    pct: relevant.length ? Math.round((attended / relevant.length) * 100) : null,
  };
}
