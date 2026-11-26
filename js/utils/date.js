// Date helpers. All stored dates are local ISO 'YYYY-MM-DD' strings and times
// are 'HH:MM'. Parse with parseISO (local midnight) — never `new Date('YYYY-MM-DD')`,
// which is UTC and shifts the day in some timezones.

const pad = (n) => String(n).padStart(2, '0');

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

export function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Local calendar date of a timestamp (e.g. createdAt). Use this instead of
 * `.slice(0, 10)` on an ISO timestamp, which gives the UTC date. Returns '' if invalid.
 */
export function localDateOf(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? '' : toISO(d);
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso) {
  const d = parseISO(iso);
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - day);
  return toISO(d);
}

export function weekDays(weekStartIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartIso, i));
}

export function compareISO(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

/** e.g. "Thu 26 Nov 2026" */
export function formatDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isISODate(iso)) return '';
  return parseISO(iso).toLocaleDateString(undefined, opts);
}

export function formatShortDate(iso) {
  return formatDate(iso, { day: 'numeric', month: 'short' });
}

export function formatDayName(iso) {
  return formatDate(iso, { weekday: 'short' });
}

export function formatWeekRange(weekStartIso) {
  const end = addDays(weekStartIso, 6);
  const sameMonth = weekStartIso.slice(0, 7) === end.slice(0, 7);
  const startStr = formatDate(weekStartIso, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${startStr} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function timeToMinutes(t) {
  if (!isTime(t)) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function relativeDay(iso, today = todayISO()) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDate(iso);
}
