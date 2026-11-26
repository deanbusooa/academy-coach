// Skill ratings / progress domain logic. Pure functions.

import { isISODate, compareISO } from '../utils/date.js';

export const SKILLS = [
  { key: 'dribbling', label: 'Dribbling', color: 'var(--c-skill-1)' },
  { key: 'passing', label: 'Passing', color: 'var(--c-skill-2)' },
  { key: 'firstTouch', label: 'First touch', color: 'var(--c-skill-3)' },
  { key: 'shooting', label: 'Shooting', color: 'var(--c-skill-4)' },
  { key: 'defending', label: 'Defending', color: 'var(--c-skill-5)' },
  { key: 'fitness', label: 'Fitness', color: 'var(--c-skill-6)' },
];
export const SKILL_KEYS = SKILLS.map((s) => s.key);
export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

export function normalizeRating(input = {}) {
  const scores = {};
  for (const k of SKILL_KEYS) {
    const n = Number(input.scores?.[k]);
    if (Number.isFinite(n) && n > 0) scores[k] = Math.round(n);
  }
  return {
    ...(input.id ? { id: input.id } : {}),
    playerId: str(input.playerId),
    date: str(input.date),
    scores,
    notes: str(input.notes),
  };
}

/** Each skill is optional, but at least one must be rated. */
export function validateRating(r) {
  const errors = {};
  if (!r.playerId) errors.playerId = 'Missing player';
  if (!isISODate(r.date)) errors.date = 'Pick a date';
  const vals = Object.entries(r.scores || {});
  if (!vals.length) errors.scores = 'Rate at least one skill';
  for (const [k, v] of vals) {
    if (!SKILL_KEYS.includes(k)) errors.scores = `Unknown skill "${k}"`;
    else if (!Number.isInteger(v) || v < MIN_SCORE || v > MAX_SCORE) errors.scores = 'Scores must be 1–5';
  }
  return errors;
}

/**
 * A player's ratings, oldest first, at most one per date. Older data may hold
 * duplicates for a date; the most recently saved one wins, so the chart,
 * history and averages agree.
 */
export function ratingsForPlayer(ratings, playerId) {
  const byDate = new Map();
  for (const r of ratings) {
    if (r.playerId !== playerId) continue;
    const seen = byDate.get(r.date);
    if (!seen || savedAt(r) >= savedAt(seen)) byDate.set(r.date, r);
  }
  return [...byDate.values()].sort((a, b) => compareISO(a.date, b.date));
}

const savedAt = (r) => r.updatedAt || r.createdAt || '';

/** The player's rating on `date`, ignoring `exceptId` (the one being edited). */
export function ratingOn(ratings, playerId, date, exceptId = null) {
  return ratingsForPlayer(ratings.filter((r) => r.id !== exceptId), playerId).find((r) => r.date === date) ?? null;
}

export function average(scores) {
  const vals = SKILL_KEYS.map((k) => scores?.[k]).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Chart series: one per skill, points sorted by date, skipping unrated entries. */
export function trendSeries(playerRatings) {
  const sorted = playerRatings.slice().sort((a, b) => compareISO(a.date, b.date));
  return SKILLS.map((s) => ({
    ...s,
    points: sorted
      .filter((r) => typeof r.scores?.[s.key] === 'number')
      .map((r) => ({ x: r.date, y: r.scores[s.key] })),
  }));
}

/** Most recent score per skill (from the latest rating that includes it). */
export function latestScores(playerRatings) {
  const out = {};
  const sorted = playerRatings.slice().sort((a, b) => compareISO(a.date, b.date));
  for (const r of sorted) for (const k of SKILL_KEYS) {
    if (typeof r.scores?.[k] === 'number') out[k] = r.scores[k];
  }
  return out;
}

/** Change per skill between the first and the latest score. */
export function changeSinceFirst(playerRatings) {
  const series = trendSeries(playerRatings);
  const out = {};
  for (const s of series) {
    if (s.points.length >= 2) out[s.key] = s.points[s.points.length - 1].y - s.points[0].y;
  }
  return out;
}

export function uniqueDates(playerRatings) {
  return [...new Set(playerRatings.map((r) => r.date))].sort(compareISO);
}
