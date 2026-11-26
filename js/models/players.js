// Player domain logic. Pure functions — no DOM, no store access.

import { isISODate, localDateOf } from '../utils/date.js';

export const POSITIONS =['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Utility'];

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function normalizePlayer(input = {}) {
  return {
    ...(input.id ? { id: input.id } : {}),
    name: str(input.name).replace(/\s+/g, ' '),
    ageGroup: str(input.ageGroup),
    position: str(input.position),
    parentName: str(input.parentName),
    parentPhone: str(input.parentPhone),
    parentEmail: str(input.parentEmail),
    notes: str(input.notes),
    // Archived players leave the roster/registers/pickers but keep all their history.
    archived: input.archived === true,
    // When they joined the squad (attendance counts from here). Older records
    // without one fall back to the day they were added to the app.
    joinedOn: isISODate(input.joinedOn) ? input.joinedOn : localDateOf(input.createdAt),
  };
}

/** @returns {Record<string,string>} field → message; empty object when valid. */
export function validatePlayer(p) {
  const errors = {};
  if (!p.name) errors.name = 'Name is required';
  else if (p.name.length > 80) errors.name = 'Keep the name under 80 characters';
  if (!p.ageGroup) errors.ageGroup = 'Pick an age group';
  if (p.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.parentEmail)) errors.parentEmail = 'That email looks wrong';
  if (p.parentPhone && !/^[+\d][\d\s()-]{5,}$/.test(p.parentPhone)) errors.parentPhone = 'That phone number looks wrong';
  return errors;
}

export function sortPlayers(players) {
  return players.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function activePlayers(players) {
  return players.filter((p) => !p.archived);
}

/** `archived: true` lists only archived players; by default they are hidden. */
export function filterPlayers(players, { query = '', ageGroup = '', archived = false } = {}) {
  const q = query.trim().toLowerCase();
  return sortPlayers(players).filter((p) => {
    if (Boolean(p.archived) !== archived) return false;
    if (ageGroup && p.ageGroup !== ageGroup) return false;
    if (!q) return true;
    return [p.name, p.position, p.parentName].some((f) => (f || '').toLowerCase().includes(q));
  });
}

export function playersInAgeGroup(players, ageGroup) {
  return sortPlayers(players.filter((p) => p.ageGroup === ageGroup));
}

/** Sanitise a phone number for a tel: link. */
export function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/** How many active and archived players are in an age group. */
export function ageGroupUsage(players, group) {
  let active = 0;
  let archived = 0;
  for (const p of players) {
    if (p.ageGroup !== group) continue;
    if (p.archived) archived++; else active++;
  }
  return { active, archived };
}

/**
 * Why an age group can't be removed yet, in words a coach can act on, or null.
 * Archived players still belong to their group, so they block removal too.
 */
export function ageGroupRemovalBlocker(group, { active, archived }) {
  if (!active && !archived) return null;
  const n = (count, word) => `${count} ${word} player${count === 1 ? '' : 's'}`;
  const who = [active && n(active, 'active'), archived && n(archived, 'archived')].filter(Boolean).join(' and ');
  const steps = [];
  if (active) steps.push(`move the active ${active === 1 ? 'player' : 'players'} to another age group (Players → player → Edit)`);
  if (archived) {
    steps.push(`${active ? 'and ' : ''}move or permanently delete the archived ${archived === 1 ? 'player' : 'players'} (Players → Archived)`);
  }
  return `${group} still has ${who}. To remove ${group}, first ${steps.join(', ')}.`;
}

/** Short label for a group's player count, e.g. "3 players · 1 archived". */
export function ageGroupUsageLabel({ active, archived }) {
  const main = `${active} player${active === 1 ? '' : 's'}`;
  return archived ? `${main} · ${archived} archived` : main;
}

export function countByAgeGroup(players) {
  const out = {};
  for (const p of players) out[p.ageGroup] = (out[p.ageGroup] || 0) + 1;
  return out;
}
