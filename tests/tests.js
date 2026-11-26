// Unit tests for pure logic: utils, models, store, backup validation.
// Run in a browser via tests/index.html or with `node tests/run-node.mjs`.

import { test, assert, eq, eqFields, memoryStorage } from './harness.js';
import * as date from '../js/utils/date.js';
import { formatDuration, initials } from '../js/utils/format.js';
import * as players from '../js/models/players.js';
import * as drills from '../js/models/drills.js';
import * as sessions from '../js/models/sessions.js';
import * as bookings from '../js/models/bookings.js';
import * as ratings from '../js/models/ratings.js';
import * as store from '../js/store.js';
import { validateBackup, buildBackup, backupToState, backupFilename, exportBackup } from '../js/backup.js';
import { deletePlayer, deleteDrill, renameAgeGroup, archivePlayer, saveRating, cancelBookingById, playerDependents } from '../js/actions.js';
import { loadDemoData } from '../js/demo.js';
import { parseHash, matchRoute, href } from '../js/router.js';

// ---------- utils ----------

test('date: startOfWeek returns Monday', () => {
  eq(date.startOfWeek('2026-11-26'), '2026-11-23'); // Thu → Mon
  eq(date.startOfWeek('2026-11-29'), '2026-11-23'); // Sun → previous Mon
  eq(date.startOfWeek('2026-11-23'), '2026-11-23');
});

test('date: addDays crosses month/year', () => {
  eq(date.addDays('2026-12-30', 3), '2027-01-02');
  eq(date.addDays('2026-03-01', -1), '2026-02-28');
});

test('date: isISODate rejects impossible dates', () => {
  assert(date.isISODate('2026-02-28'));
  assert(!date.isISODate('2026-02-30'));
  assert(!date.isISODate('26-1-1'));
});

test('date: time helpers', () => {
  eq(date.timeToMinutes('17:30'), 1050);
  eq(date.minutesToTime(1050 + 75), '18:45');
  assert(date.isTime('09:05') && !date.isTime('24:00'));
});

test('date: localDateOf uses the local calendar day, not UTC (regression)', () => {
  // Just after midnight and just before midnight local time: in any non-UTC
  // timezone one of these has a different UTC date, which .slice(0, 10) returned.
  eq(date.localDateOf(new Date(2026, 10, 26, 0, 30).toISOString()), '2026-11-26');
  eq(date.localDateOf(new Date(2026, 10, 26, 23, 30).toISOString()), '2026-11-26');
  eq(date.localDateOf(''), '');
  eq(date.localDateOf('not a date'), '');
  eq(date.localDateOf(null), '');
});

test('format: duration and initials', () => {
  eq(formatDuration(45), '45 min');
  eq(formatDuration(90), '1h 30m');
  eq(initials('leo de la cruz'), 'LC');
  eq(initials(''), '?');
});

// ---------- router ----------

test('router: parse and match with params + query', () => {
  const routes = [{ path: '/players' }, { path: '/players/:id' }];
  const { path, query } = parseHash('#/players/abc?x=1');
  eq(path, '/players/abc');
  eq(query, { x: '1' });
  const m = matchRoute(routes, path);
  eq(m.params, { id: 'abc' });
  eq(matchRoute(routes, '/nope'), null);
  eq(href('/bookings', { week: '2026-11-23', empty: '' }), '#/bookings?week=2026-11-23');
});

test('router: malformed %-escape does not throw (regression)', () => {
  const routes = [{ path: '/players/:id' }];
  eq(matchRoute(routes, '/players/%E0%A4%A'), null);
  eq(matchRoute(routes, '/players/%'), null);
  eq(matchRoute(routes, '/players/a%20b').params, { id: 'a b' });
});

// ---------- players ----------

test('players: normalize trims and validates', () => {
  const p = players.normalizePlayer({ name: '  Leo   Martins ', ageGroup: 'U9', parentEmail: 'bad' });
  eq(p.name, 'Leo Martins');
  const errs = players.validatePlayer(p);
  assert(errs.parentEmail, 'email error expected');
  assert(!errs.name && !errs.ageGroup);
  assert(players.validatePlayer(players.normalizePlayer({})).name);
});

test('players: filter by query and age group, sorted', () => {
  const list = [
    { id: '1', name: 'Zed', ageGroup: 'U9', position: 'Forward' },
    { id: '2', name: 'amy', ageGroup: 'U9', position: 'Defender' },
    { id: '3', name: 'Bob', ageGroup: 'U11', position: 'Forward' },
  ];
  eq(players.filterPlayers(list, {}).map((p) => p.id), ['2', '3', '1']);
  eq(players.filterPlayers(list, { ageGroup: 'U9' }).map((p) => p.id), ['2', '1']);
  eq(players.filterPlayers(list, { query: 'forw' }).map((p) => p.id), ['3', '1']);
});

test('players: archived hidden by default, listed separately', () => {
  const list = [
    { id: '1', name: 'Active', ageGroup: 'U9' },
    { id: '2', name: 'Gone', ageGroup: 'U9', archived: true },
  ];
  eq(players.filterPlayers(list, {}).map((p) => p.id), ['1']);
  eq(players.filterPlayers(list, { archived: true }).map((p) => p.id), ['2']);
  eq(players.activePlayers(list).map((p) => p.id), ['1']);
  eq(players.normalizePlayer({ name: 'x', archived: true }).archived, true);
  eq(players.normalizePlayer({ name: 'x', archived: 'yes' }).archived, false, 'only literal true archives');
  eq(players.normalizePlayer({ name: 'x' }).archived, false);
});

test('sessions: register hides archived players but keeps their past marks', () => {
  const ps = [
    { id: 'a', name: 'A', ageGroup: 'U9' },
    { id: 'b', name: 'B', ageGroup: 'U9', archived: true },
    { id: 'c', name: 'C', ageGroup: 'U9', archived: true },
  ];
  const s = sessions.normalizeSession({ date: '2026-11-01', ageGroup: 'U9', attendance: { c: 'present' } });
  eq(sessions.sessionRoster(ps, s).map((p) => p.id), ['a', 'c']);
});

test('players: archiving keeps history; edit form round-trip keeps flag', () => {
  store.init({ storage: memoryStorage() });
  const p = store.upsert('players', players.normalizePlayer({ name: 'A', ageGroup: 'U9' }));
  store.upsert('ratings', { playerId: p.id, date: '2026-11-01', scores: { dribbling: 3 } });
  store.upsert('bookings', { playerId: p.id, date: '2026-11-01', startTime: '10:00' });
  store.upsert('players', { ...p, archived: true });
  eq(store.getAll('ratings').length, 1);
  eq(store.getAll('bookings').length, 1);
  // The edit sheet normalises { ...storedValues, ...formFields }; archived must survive.
  const edited = players.normalizePlayer({ ...store.get('players', p.id), name: 'A Renamed' });
  eq(edited.archived, true);
});

test('age group removal: counts active vs archived and explains (regression)', () => {
  const list = [
    { ageGroup: 'U9' }, { ageGroup: 'U9' }, { ageGroup: 'U9', archived: true },
    { ageGroup: 'U11', archived: true },
    { ageGroup: 'U12' },
  ];
  eq(players.ageGroupUsage(list, 'U9'), { active: 2, archived: 1 });
  eq(players.ageGroupUsage(list, 'U11'), { active: 0, archived: 1 });
  eq(players.ageGroupUsage(list, 'U7'), { active: 0, archived: 0 });

  eq(players.ageGroupUsageLabel({ active: 2, archived: 1 }), '2 players · 1 archived');
  eq(players.ageGroupUsageLabel({ active: 1, archived: 0 }), '1 player');
  eq(players.ageGroupUsageLabel({ active: 0, archived: 0 }), '0 players');

  eq(players.ageGroupRemovalBlocker('U7', { active: 0, archived: 0 }), null);
  const both = players.ageGroupRemovalBlocker('U9', { active: 2, archived: 1 });
  assert(both.startsWith('U9 still has 2 active players and 1 archived player.'), both);
  assert(/move the active players to another age group/.test(both) && /archived player \(Players → Archived\)/.test(both), both);
  // Only archived players: the case that used to be a mystery ("0 players" but can't delete).
  const archivedOnly = players.ageGroupRemovalBlocker('U11', { active: 0, archived: 1 });
  eq(archivedOnly, 'U11 still has 1 archived player. To remove U11, first move or permanently delete the archived player (Players → Archived).');
  const activeOnly = players.ageGroupRemovalBlocker('U12', { active: 1, archived: 0 });
  eq(activeOnly, 'U12 still has 1 active player. To remove U12, first move the active player to another age group (Players → player → Edit).');
});

test('players: telHref strips formatting', () => {
  eq(players.telHref('+44 (0)7700 900-101'), 'tel:+4407700900101');
  eq(players.telHref(''), null);
});

// ---------- drills ----------

test('drills: lists from multi-line text, strips bullets', () => {
  const d = drills.normalizeDrill({ name: 'Rondo', durationMin: '15', equipment: '- cones\n\n• bibs ', coachingPoints: ['  a ', ''] });
  eq(d.equipment, ['cones', 'bibs']);
  eq(d.coachingPoints, ['a']);
  eq(d.durationMin, 15);
  eq(drills.validateDrill(d), {});
  assert(drills.validateDrill(drills.normalizeDrill({ name: 'x', durationMin: 0 })).durationMin);
});

test('drills: age-group suitability (empty = all)', () => {
  const list = [
    { id: 'a', name: 'A', ageGroups: [], equipment: [], coachingPoints: [] },
    { id: 'b', name: 'B', ageGroups: ['U11'], equipment: ['cones'], coachingPoints: [] },
  ];
  eq(drills.filterDrills(list, { ageGroup: 'U9' }).map((d) => d.id), ['a']);
  eq(drills.filterDrills(list, { query: 'cone' }).map((d) => d.id), ['b']);
  eq(drills.equipmentFor([{ equipment: ['Cones', 'Bibs'] }, { equipment: ['cones'] }]), ['Bibs', 'Cones']);
});

// ---------- sessions ----------

test('sessions: attendance cycle', () => {
  eq(sessions.nextAttendance(undefined), 'present');
  eq(sessions.nextAttendance('present'), 'late');
  eq(sessions.nextAttendance('late'), 'absent');
  eq(sessions.nextAttendance('absent'), null);
});

test('sessions: roster includes guests, summary counts', () => {
  const ps = [
    { id: '1', name: 'A', ageGroup: 'U9' }, { id: '2', name: 'B', ageGroup: 'U9' }, { id: '3', name: 'C', ageGroup: 'U11' },
  ];
  let s = sessions.normalizeSession({ date: '2026-11-26', ageGroup: 'U9' });
  eq(sessions.sessionRoster(ps, s).map((p) => p.id), ['1', '2']);
  s = sessions.setAttendance(s, '3', 'present');
  s = sessions.setAttendance(s, '1', 'late');
  const roster = sessions.sessionRoster(ps, s);
  eq(roster.map((p) => p.id), ['1', '2', '3']);
  eq(sessions.attendanceSummary(s, roster), { present: 1, late: 1, absent: 0, unmarked: 1, total: 3 });
  s = sessions.setAttendance(s, '1', null);
  assert(!('1' in s.attendance));
});

test('sessions: duration, reorder, remove', () => {
  const ds = [{ id: 'a', durationMin: 10 }, { id: 'b', durationMin: 15 }];
  let s = sessions.normalizeSession({ drillIds: ['a', 'b', 'missing'] });
  eq(sessions.totalDuration(s, ds), 25);
  s = sessions.moveDrill(s, 0, 1);
  eq(s.drillIds, ['b', 'a', 'missing']);
  eq(sessions.moveDrill(s, 0, -1).drillIds, s.drillIds);
  eq(sessions.removeDrillAt(s, 2).drillIds, ['b', 'a']);
});

test('sessions: player attendance %', () => {
  const p = { id: 'p', ageGroup: 'U9' };
  const ss = [
    { date: '2026-11-01', ageGroup: 'U9', attendance: { p: 'present' } },
    { date: '2026-11-08', ageGroup: 'U9', attendance: { x: 'present' } }, // p unmarked → counts as missed
    { date: '2026-11-15', ageGroup: 'U9', attendance: { p: 'late' } },
    { date: '2026-11-22', ageGroup: 'U9', attendance: {} }, // register not taken → ignored
    { date: '2026-12-01', ageGroup: 'U9', attendance: { p: 'present' } }, // future → ignored
  ];
  eq(sessions.playerAttendance(ss, p, '2026-11-26'), { attended: 2, total: 3, pct: 67 });
});

test('sessions: attendance ignores sessions before the player joined (regression)', () => {
  // Joined 10 Nov (local). Built from local time so the test holds in any timezone.
  const p = { id: 'p', ageGroup: 'U9', createdAt: new Date(2026, 10, 10, 9, 0).toISOString() };
  const ss = [
    { date: '2026-11-01', ageGroup: 'U9', attendance: { x: 'present' } }, // before joining → ignored
    { date: '2026-11-03', ageGroup: 'U9', attendance: { p: 'present' } }, // explicitly marked → counts
    { date: '2026-11-10', ageGroup: 'U9', attendance: { x: 'present' } }, // join day, missed → counts
    { date: '2026-11-17', ageGroup: 'U9', attendance: { p: 'late' } },
  ];
  eq(sessions.playerAttendance(ss, p, '2026-11-26'), { attended: 2, total: 3, pct: 67 });
});

test('players: joinedOn drives attendance; defaults to the createdAt day', () => {
  // Entering an existing squad today: they joined months ago, so earlier sessions count.
  const p = players.normalizePlayer({ id: 'p', name: 'A', ageGroup: 'U9', joinedOn: '2026-09-01', createdAt: new Date(2026, 10, 20, 9).toISOString() });
  eq(p.joinedOn, '2026-09-01');
  const ss = [
    { date: '2026-08-25', ageGroup: 'U9', attendance: { x: 'present' } }, // before joining
    { date: '2026-10-01', ageGroup: 'U9', attendance: { x: 'present' } }, // missed
    { date: '2026-11-01', ageGroup: 'U9', attendance: { p: 'present' } },
  ];
  eq(sessions.playerAttendance(ss, p, '2026-11-26'), { attended: 1, total: 2, pct: 50 });

  eq(players.normalizePlayer({ name: 'B', createdAt: new Date(2026, 10, 20, 23, 30).toISOString() }).joinedOn, '2026-11-20');
  eq(players.normalizePlayer({ name: 'C', joinedOn: '2026-02-30' }).joinedOn, '', 'invalid date dropped');
  eq(players.normalizePlayer({ name: 'D' }).joinedOn, '');
});

// ---------- bookings ----------

test('bookings: normalize/validate, end time', () => {
  const b = bookings.normalizeBooking({ playerId: 'p', date: '2026-11-26', startTime: '16:30', durationMin: '45', price: '30.555', paid: 1 });
  eq(b.price, 30.56);
  eq(b.paid, true);
  eq(bookings.endTime(b), '17:15');
  eq(bookings.validateBooking(b), {});
  assert(bookings.validateBooking(bookings.normalizeBooking({})).playerId);
});

test('bookings: week filter, grouping, totals', () => {
  const list = [
    { id: '1', date: '2026-11-23', startTime: '17:00', price: 30, paid: true },
    { id: '2', date: '2026-11-23', startTime: '09:00', price: 25, paid: false },
    { id: '3', date: '2026-11-29', startTime: '10:00', price: 30, paid: false },
    { id: '4', date: '2026-11-30', startTime: '10:00', price: 30, paid: false },
  ];
  const wk = bookings.bookingsInWeek(list, '2026-11-23');
  eq(wk.map((b) => b.id), ['2', '1', '3']);
  const byDay = bookings.groupByDay(wk, date.weekDays('2026-11-23'));
  eq(byDay['2026-11-23'].map((b) => b.id), ['2', '1']);
  eq(bookings.totals(wk), { count: 3, paidCount: 1, unpaidCount: 2, total: 85, paid: 30, unpaid: 55 });
});

test('bookings: clash detection', () => {
  const list = [{ id: '1', date: '2026-11-26', startTime: '16:00', durationMin: 60 }];
  eq(bookings.findClashes(list, { id: 'n', date: '2026-11-26', startTime: '16:30', durationMin: 30 }).length, 1);
  eq(bookings.findClashes(list, { id: 'n', date: '2026-11-26', startTime: '17:00', durationMin: 30 }).length, 0);
  eq(bookings.findClashes(list, { id: '1', date: '2026-11-26', startTime: '16:00', durationMin: 60 }).length, 0);
});

test('bookings: paid bookings are cancelled (refund due), unpaid can be deleted', () => {
  const at = (date, startTime, paid) => bookings.removalAction({ date, startTime, paid }, '2026-11-26', '18:00');
  eq(at('2026-12-01', '16:00', true), 'cancel', 'paid, future');
  eq(at('2026-11-26', '18:30', true), 'cancel', 'paid, later today');
  eq(at('2026-11-26', '18:00', true), 'delete-mistake', 'paid, starting now');
  eq(at('2026-11-20', '16:00', true), 'delete-mistake', 'paid, past: no cancel/refund');
  eq(at('2026-11-20', '16:00', false), 'delete', 'unpaid, past');
  eq(at('2026-12-01', '16:00', false), 'delete', 'unpaid, future');

  store.init({ storage: memoryStorage() });
  const paid = store.upsert('bookings', bookings.normalizeBooking({ playerId: 'p', date: '2026-12-01', startTime: '16:00', durationMin: 60, price: 35, paid: true }));
  const unpaid = store.upsert('bookings', bookings.normalizeBooking({ playerId: 'p', date: '2026-12-02', startTime: '16:00', durationMin: 60, price: 30 }));
  const saved = cancelBookingById(paid.id);
  eq([saved.status, saved.refundDue], ['cancelled', true]);
  eq(store.getAll('bookings').length, 2, 'kept on record');
  eq(bookings.bookingsInWeek(store.getAll('bookings'), '2026-11-30').map((b) => b.id), [unpaid.id], 'off the calendar');
  eq(bookings.refundsDueTotal(store.getAll('bookings')), 35);
  eq(cancelBookingById(paid.id), null, 'already cancelled');
  eq(cancelBookingById('missing'), null);
});

// ---------- ratings ----------

test('ratings: validate range and at-least-one', () => {
  const ok = ratings.normalizeRating({ playerId: 'p', date: '2026-11-26', scores: { dribbling: 4, passing: '3', shooting: undefined } });
  eq(ok.scores, { dribbling: 4, passing: 3 });
  eq(ratings.validateRating(ok), {});
  assert(ratings.validateRating(ratings.normalizeRating({ playerId: 'p', date: '2026-11-26', scores: {} })).scores);
  assert(ratings.validateRating({ playerId: 'p', date: '2026-11-26', scores: { dribbling: 6 } }).scores);
});

test('ratings: trend series, latest, change', () => {
  const rs = [
    { playerId: 'p', date: '2026-10-01', scores: { dribbling: 2, passing: 3 } },
    { playerId: 'p', date: '2026-11-01', scores: { dribbling: 4 } },
    { playerId: 'q', date: '2026-11-01', scores: { dribbling: 1 } },
  ];
  const mine = ratings.ratingsForPlayer(rs, 'p');
  eq(mine.length, 2);
  const series = ratings.trendSeries(mine);
  eq(series.find((s) => s.key === 'dribbling').points, [{ x: '2026-10-01', y: 2 }, { x: '2026-11-01', y: 4 }]);
  eq(series.find((s) => s.key === 'shooting').points, []);
  eq(ratings.latestScores(mine), { dribbling: 4, passing: 3 });
  eq(ratings.changeSinceFirst(mine), { dribbling: 2 });
  eq(ratings.average({ dribbling: 4, passing: 3 }), 3.5);
});

test('ratings: one per player per date — saving on a used date replaces it (regression)', () => {
  store.init({ storage: memoryStorage() });
  const R = (date, dribbling, extra = {}) => ratings.normalizeRating({ playerId: 'p', date, scores: { dribbling }, ...extra });

  const first = saveRating(R('2026-11-20', 2));
  eq(first.replaced, false);
  const again = saveRating(R('2026-11-20', 4, { notes: 'second go' }));
  eq(again.replaced, true);
  eq(again.saved.id, first.saved.id, 'same record, not a new point');
  eq(store.getAll('ratings').length, 1);
  eq(store.get('ratings', first.saved.id).scores, { dribbling: 4 });
  eq(store.get('ratings', first.saved.id).notes, 'second go');

  // Other players and other dates are unaffected.
  saveRating(ratings.normalizeRating({ playerId: 'q', date: '2026-11-20', scores: { passing: 3 } }));
  const later = saveRating(R('2026-11-27', 5));
  eq(later.replaced, false);
  eq(store.getAll('ratings').length, 3);

  // Editing the 27th onto the 20th merges them: one rating left on the 20th, with the edited scores.
  const moved = saveRating({ ...store.get('ratings', later.saved.id), date: '2026-11-20' });
  eq(moved.replaced, true);
  const mine = store.getAll('ratings').filter((r) => r.playerId === 'p');
  eq(mine.length, 1);
  eq([mine[0].date, mine[0].scores.dribbling], ['2026-11-20', 5]);

  // Editing a rating on its own date is a plain update.
  eq(saveRating({ ...mine[0], notes: 'x' }).replaced, false);
  eq(store.getAll('ratings').filter((r) => r.playerId === 'p').length, 1);
});

test('ratings: legacy duplicates on a date collapse to the latest saved', () => {
  const list = [
    { id: 'a', playerId: 'p', date: '2026-11-20', scores: { dribbling: 2 }, updatedAt: '2026-11-20T10:00:00Z' },
    { id: 'b', playerId: 'p', date: '2026-11-20', scores: { dribbling: 4 }, updatedAt: '2026-11-20T18:00:00Z' },
    { id: 'c', playerId: 'p', date: '2026-11-27', scores: { dribbling: 5 } },
  ];
  eq(ratings.ratingsForPlayer(list, 'p').map((r) => r.id), ['b', 'c']);
  eq(ratings.trendSeries(ratings.ratingsForPlayer(list, 'p'))[0].points, [{ x: '2026-11-20', y: 4 }, { x: '2026-11-27', y: 5 }]);
  eq(ratings.ratingOn(list, 'p', '2026-11-20').id, 'b');
  eq(ratings.ratingOn(list, 'p', '2026-11-20', 'b').id, 'a', 'ignores the one being edited');
  eq(ratings.ratingOn(list, 'p', '2026-11-21'), null);

  // saveRating on that date also removes the stale duplicate.
  store.init({ storage: memoryStorage() });
  store.replaceAll({ schemaVersion: 1, ratings: list });
  saveRating(ratings.normalizeRating({ playerId: 'p', date: '2026-11-20', scores: { dribbling: 3 } }));
  eq(store.getAll('ratings').filter((r) => r.date === '2026-11-20').map((r) => r.scores.dribbling), [3]);
});

test('ratings: change since last vs since first; rubric anchors', () => {
  const rs = [
    { playerId: 'p', date: '2026-09-01', scores: { dribbling: 2, passing: 3 } },
    { playerId: 'p', date: '2026-10-01', scores: { dribbling: 4 } },              // passing not observed
    { playerId: 'p', date: '2026-11-01', scores: { dribbling: 3, passing: 4 } },
  ];
  eq(ratings.changeSinceFirst(rs), { dribbling: 1, passing: 1 });
  eq(ratings.changeSinceLast(rs), { dribbling: -1, passing: 1 }, 'last = previous time that skill was scored');
  eq(ratings.changeSinceLast(rs.slice(0, 1)), {});
  eq(ratings.RUBRIC.map((r) => r.score), [1, 3, 5]);
});

// ---------- store ----------

test('store: CRUD persists and notifies', () => {
  const storage = memoryStorage();
  store.init({ storage });
  let calls = 0;
  store.subscribe(() => calls++);
  const p = store.upsert('players', { name: 'A', ageGroup: 'U9' });
  assert(p.id && p.createdAt, 'id + createdAt assigned');
  store.upsert('players', { ...p, name: 'B' });
  eq(store.get('players', p.id).name, 'B');
  eq(calls, 2);
  const saved = JSON.parse(storage.getItem(store.STORAGE_KEY));
  eq(saved.players[0].name, 'B');
  store.remove('players', p.id);
  eq(store.getAll('players').length, 0);
});

test('store: reload from storage + defaults filled', () => {
  const storage = memoryStorage({ [store.STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, players: [{ id: 'x', name: 'X' }] }) });
  store.init({ storage });
  eq(store.getAll('players').length, 1);
  eq(store.getAll('drills'), []);
  assert(store.getSettings().ageGroups.includes('U9'));
});

test('store: malformed backup records are normalised (regression)', () => {
  store.init({ storage: memoryStorage() });
  store.replaceAll({
    schemaVersion: 1,
    players: [{ id: 'p1', name: 42, ageGroup: null, createdAt: '2026-11-01T10:00:00.000Z' }, 'junk', null, { name: 'No Id' }],
    drills: [{ id: 'd1', name: 'Rondo', equipment: 'cones\nbibs', coachingPoints: null, durationMin: '15' }],
    sessions: [{ id: 's1', date: '2026-11-01', attendance: { p1: 'present', x: 'maybe' }, drillIds: null }, { id: 's2', attendance: [] }],
    bookings: [{ id: 'b1', price: 'free', paid: 'yes' }],
    ratings: [{ id: 'r1', scores: null }, { id: 'r2', scores: { dribbling: '4', bogus: 3 } }],
    settings: { ageGroups: ['U9', 3, '', 'U9'], currency: 7, defaultPrice: -5 },
    meta: 'nope',
  });
  const loaded = store.getAll('players');
  eq(loaded.length, 2);
  eqFields(loaded[0], { id: 'p1', name: '42', ageGroup: '', position: '', parentName: '', parentPhone: '', parentEmail: '', notes: '', archived: false, joinedOn: date.localDateOf('2026-11-01T10:00:00.000Z'), createdAt: '2026-11-01T10:00:00.000Z' });
  assert(typeof loaded[1].id === 'string' && loaded[1].id, 'missing id assigned');
  eq(store.get('drills', 'd1').equipment, ['cones', 'bibs']);
  eq(store.get('drills', 'd1').coachingPoints, []);
  eq(store.get('sessions', 's1').attendance, { p1: 'present' });
  eq(store.get('sessions', 's1').drillIds, []);
  eq(store.get('sessions', 's2').attendance, {});
  eq(store.get('bookings', 'b1').price, 0);
  eq(store.get('bookings', 'b1').paid, true);
  eq(store.get('ratings', 'r1').scores, {});
  eq(store.get('ratings', 'r2').scores, { dribbling: 4 });
  const settings = store.getSettings();
  eq(settings.ageGroups, ['U9']);
  eq(settings.currency, store.defaultSettings().currency);
  eq(settings.defaultPrice, store.defaultSettings().defaultPrice);
  eq(store.getMeta().lastExportAt, null);
  // The functions views call must not throw on the result.
  players.filterPlayers(loaded, { query: 'x' });
  sessions.splitUpcomingPast(store.getAll('sessions'), '2026-11-26');
  sessions.sessionRoster(loaded, store.get('sessions', 's1'));
  drills.filterDrills(store.getAll('drills'), { query: 'cone' });
});

test('store: unknown record fields survive reload and import (regression)', () => {
  const storage = memoryStorage({
    [store.STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      players: [{ id: 'p', name: 'A', ageGroup: 'U9', shirtNumber: 7, kit: { size: 'S' }, createdAt: 5 }],
      sessions: [{ id: 's', date: '2026-11-01', ageGroup: 'U9', weather: 'rain' }],
    }),
  });
  store.init({ storage });
  eq(store.get('players', 'p').shirtNumber, 7);
  eq(store.get('players', 'p').kit, { size: 'S' });
  assert(!('createdAt' in store.get('players', 'p')), 'non-string createdAt dropped');
  eq(store.get('sessions', 's').weather, 'rain');
  // A save writes them back out.
  store.upsert('players', { ...store.get('players', 'p'), name: 'B' });
  eq(JSON.parse(storage.getItem(store.STORAGE_KEY)).players[0].shirtNumber, 7);
  // Same through import.
  store.replaceAll({ schemaVersion: 1, drills: [{ id: 'd', name: 'x', durationMin: 5, video: 'url' }] });
  eq(store.get('drills', 'd').video, 'url');
});

test('store: corrupt data is set aside, not lost', () => {
  const storage = memoryStorage({ [store.STORAGE_KEY]: '{not json' });
  store.init({ storage });
  assert(store.getLoadWarning());
  assert(storage.keys().some((k) => k.startsWith(`${store.STORAGE_KEY}.corrupt-`)));
});

test('store: batch notifies once', () => {
  store.init({ storage: memoryStorage() });
  let calls = 0;
  store.subscribe(() => calls++);
  store.batch(() => {
    store.upsert('drills', { name: 'a' });
    store.upsert('drills', { name: 'b' });
  });
  eq(calls, 1);
  eq(store.getAll('drills').length, 2);
});

test('store: failed save rolls back and reports via the handler (regression)', () => {
  const storage = memoryStorage();
  store.init({ storage });
  const errorsSeen = [];
  store.onSaveError((err) => errorsSeen.push(err.message));
  let notified = 0;
  store.subscribe(() => notified++);
  try {
    const p = store.upsert('players', { name: 'A', ageGroup: 'U9' });
    const savedJson = storage.getItem(store.STORAGE_KEY);
    notified = 0;
    storage.failing = true;

    eq(store.upsert('players', { ...p, name: 'Changed' }), null, 'update returns null');
    eq(store.get('players', p.id).name, 'A', 'update rolled back');
    eq(store.upsert('players', { name: 'New', ageGroup: 'U9' }), null);
    eq(store.getAll('players').length, 1, 'insert rolled back');
    eq(store.remove('players', p.id), false);
    eq(store.removeWhere('players', () => true), 0);
    eq(store.updateSettings({ currency: 'EUR' }), null);
    eq(store.replaceAll({ schemaVersion: 1 }), false);
    eq(store.resetAll(), false);
    eq(store.getAll('players').length, 1, 'still there after failed remove/reset');
    eq(store.getSettings().currency !== 'EUR', true);
    eq(notified, 0, 'no re-render for failed writes');
    eq(storage.getItem(store.STORAGE_KEY), savedJson, 'storage untouched');
    eq(errorsSeen.length, 7, 'one report per failed write');
    assert(/Could not save/.test(errorsSeen[0]));

    // Multi-collection batch is all-or-nothing.
    store.batch(() => {}); // empty batch is fine
    storage.failing = false;
    store.upsert('ratings', { playerId: p.id, date: '2026-11-01', scores: { dribbling: 3 } });
    storage.failing = true;
    eq(deletePlayer(p.id), false);
    eq(store.getAll('players').length, 1, 'batch rolled back: player');
    eq(store.getAll('ratings').length, 1, 'batch rolled back: rating');

    // Recovers once storage works again.
    storage.failing = false;
    assert(store.upsert('players', { ...p, name: 'B' }));
    eq(JSON.parse(storage.getItem(store.STORAGE_KEY)).players[0].name, 'B');
  } finally {
    store.onSaveError(null);
  }
});

test('store: picks up writes from another tab (regression: multi-tab data loss)', () => {
  const storage = memoryStorage();
  const events = new EventTarget();
  store.init({ storage, events });
  const mine = store.upsert('players', { name: 'Tab A', ageGroup: 'U9' });
  let notified = 0;
  store.subscribe(() => notified++);

  // Another tab saves its own state containing A's player plus a new one.
  const other = JSON.parse(storage.getItem(store.STORAGE_KEY));
  other.players.push({ id: 'from-b', name: 'Tab B', ageGroup: 'U9' });
  const fire = (key, newValue) => events.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));
  fire('unrelated-key', '{}');
  eq(notified, 0, 'other keys ignored');
  fire(store.STORAGE_KEY, JSON.stringify(other));
  eq(notified, 1);
  eq(store.getAll('players').map((p) => p.name).sort(), ['Tab A', 'Tab B']);

  // Our next write now keeps the other tab's player instead of erasing it.
  store.upsert('players', { ...mine, name: 'Tab A2' });
  eq(JSON.parse(storage.getItem(store.STORAGE_KEY)).players.map((p) => p.name).sort(), ['Tab A2', 'Tab B']);

  fire(store.STORAGE_KEY, '{garbage');
  eq(store.getAll('players').length, 2, 'unreadable change ignored');

  storage.removeItem(store.STORAGE_KEY);
  fire(null, null); // localStorage.clear() in another tab
  eq(store.getAll('players').length, 0);
  store.init({ storage: memoryStorage(), events: null }); // detach
});

test('store: batch rolls back if its function throws', () => {
  store.init({ storage: memoryStorage() });
  store.upsert('drills', { name: 'keep' });
  let threw = false;
  try {
    store.batch(() => { store.upsert('drills', { name: 'temp' }); throw new Error('boom'); });
  } catch { threw = true; }
  assert(threw, 'error re-thrown');
  eq(store.getAll('drills').map((d) => d.name), ['keep']);
  assert(store.upsert('drills', { name: 'after' }), 'store usable afterwards');
});

test('defaults: AUD currency; demo phones are +61 and valid (regression)', () => {
  eq(store.defaultSettings().currency, 'AUD');
  store.init({ storage: memoryStorage() });
  eq(store.getSettings().currency, 'AUD');
  assert(loadDemoData('2026-11-26'), 'demo data saved');
  const demo = store.getAll('players');
  assert(demo.length > 0);
  for (const p of demo) {
    assert(/^\+61 4\d{2} \d{3} \d{3}$/.test(p.parentPhone), `${p.name}: ${p.parentPhone}`);
    eq(players.validatePlayer(p), {}, p.name);
    assert(players.telHref(p.parentPhone).startsWith('tel:+614'));
  }
});

test('demo data only loads into a completely empty store (regression)', () => {
  for (const c of store.COLLECTIONS) {
    store.init({ storage: memoryStorage() });
    assert(store.isEmpty());
    const seeded = store.upsert(c, { id: `real-${c}`, name: 'Real', playerId: 'x', date: '2026-11-01', startTime: '10:00', scores: { dribbling: 3 } });
    assert(!store.isEmpty(), `${c} counts as data`);
    eq(loadDemoData('2026-11-26'), false, `refused with existing ${c}`);
    eq(store.getAll(c), [seeded], `${c} untouched`);
    for (const other of store.COLLECTIONS) if (other !== c) eq(store.getAll(other).length, 0, `no demo ${other} added`);
  }
  store.init({ storage: memoryStorage() });
  store.updateSettings({ currency: 'EUR' }); // settings alone don't count
  assert(store.isEmpty());
  assert(loadDemoData('2026-11-26'));
});

test('store: rejects data from a newer schema', () => {
  let threw = false;
  try { store.migrate({ schemaVersion: store.SCHEMA_VERSION + 1 }); } catch { threw = true; }
  assert(threw);
});

// ---------- actions (cascades) ----------

test('actions: deletePlayer cascades', () => {
  store.init({ storage: memoryStorage() });
  const p = store.upsert('players', { name: 'A', ageGroup: 'U9' });
  const q = store.upsert('players', { name: 'B', ageGroup: 'U9' });
  store.upsert('ratings', { playerId: p.id, date: '2026-11-01', scores: { dribbling: 3 } });
  store.upsert('bookings', { playerId: p.id, date: '2026-11-01', startTime: '10:00' });
  store.upsert('bookings', { playerId: q.id, date: '2026-11-01', startTime: '11:00' });
  const s = store.upsert('sessions', { date: '2026-11-01', ageGroup: 'U9', drillIds: [], attendance: { [p.id]: 'present', [q.id]: 'late' } });
  deletePlayer(p.id);
  eq(store.getAll('players').map((x) => x.id), [q.id]);
  eq(store.getAll('ratings').length, 0);
  eq(store.getAll('bookings').length, 1);
  eq(store.get('sessions', s.id).attendance, { [q.id]: 'late' });
});

test('actions: archiving cancels only upcoming 1-1s', () => {
  eq(bookings.isUpcoming({ date: '2026-11-27', startTime: '09:00' }, '2026-11-26', '18:00'), true);
  eq(bookings.isUpcoming({ date: '2026-11-26', startTime: '18:30' }, '2026-11-26', '18:00'), true);
  eq(bookings.isUpcoming({ date: '2026-11-26', startTime: '18:00' }, '2026-11-26', '18:00'), false, 'started now');
  eq(bookings.isUpcoming({ date: '2026-11-25', startTime: '23:00' }, '2026-11-26', '18:00'), false);

  store.init({ storage: memoryStorage() });
  const p = store.upsert('players', { name: 'Leaving', ageGroup: 'U9' });
  const q = store.upsert('players', { name: 'Staying', ageGroup: 'U9' });
  const B = (playerId, date, startTime, paid = false) => store.upsert('bookings', { playerId, date, startTime, durationMin: 60, price: 30, paid });
  const pastUnpaid = B(p.id, '2026-11-20', '16:00');
  const earlierToday = B(p.id, '2026-11-26', '09:00', true);
  const laterTodayUnpaid = B(p.id, '2026-11-26', '19:00');
  const nextWeekPaid = B(p.id, '2026-12-03', '16:00', true);
  const other = B(q.id, '2026-12-03', '17:00');

  eq(bookings.upcomingForPlayer(store.getAll('bookings'), p.id, '2026-11-26', '18:00').length, 2);
  assert(archivePlayer(p.id, { today: '2026-11-26', time: '18:00' }));
  eq(store.get('players', p.id).archived, true);

  // Nothing is deleted (regression): upcoming ones are cancelled, past ones untouched.
  eq(store.getAll('bookings').length, 5);
  const st = (b) => { const x = store.get('bookings', b.id); return [x.status ?? 'booked', Boolean(x.refundDue)]; };
  eq(st(laterTodayUnpaid), ['cancelled', false], 'unpaid: cancelled, nothing to refund');
  eq(st(nextWeekPaid), ['cancelled', true], 'paid: cancelled with refund due');
  eq(st(pastUnpaid), ['booked', false], 'past unpaid kept as owed');
  eq(st(earlierToday), ['booked', false], 'already started: kept');
  eq(st(other), ['booked', false], 'other player untouched');
  eq(store.get('players', q.id).archived, undefined);
  eq(bookings.upcomingForPlayer(store.getAll('bookings'), p.id, '2026-11-26', '18:00'), [], 'cancelled are not upcoming');
  eq(archivePlayer('missing'), false);
});

test('bookings: cancelled ones leave calendar, totals, owed and clashes; refunds tracked (regression)', () => {
  const live = bookings.normalizeBooking({ id: 'a', playerId: 'p', date: '2026-11-24', startTime: '16:00', durationMin: 60, price: 30, paid: true });
  const unpaid = bookings.normalizeBooking({ id: 'b', playerId: 'p', date: '2026-11-23', startTime: '10:00', durationMin: 60, price: 25 });
  const cancelledPaid = bookings.cancelBooking(bookings.normalizeBooking({ id: 'c', playerId: 'p', date: '2026-11-25', startTime: '16:00', durationMin: 60, price: 40, paid: true }), 'T1');
  const cancelledUnpaid = bookings.cancelBooking(bookings.normalizeBooking({ id: 'd', playerId: 'p', date: '2026-11-23', startTime: '09:00', durationMin: 60, price: 20 }), 'T1');
  const list = [live, unpaid, cancelledPaid, cancelledUnpaid];

  eq(cancelledPaid.status, 'cancelled');
  eq(cancelledPaid.refundDue, true);
  eq(cancelledPaid.cancelledAt, 'T1');
  eq(cancelledUnpaid.refundDue, false);
  eq(live.status, 'booked');

  eq(bookings.bookingsInWeek(list, '2026-11-23').map((b) => b.id), ['b', 'a'], 'calendar');
  eq(bookings.totals(list), { count: 2, paidCount: 1, unpaidCount: 1, total: 55, paid: 30, unpaid: 25 }, 'totals');
  eq(bookings.unpaidBookings(list, '2026-11-26').map((b) => b.id), ['b'], 'cancelled unpaid is not owed');
  eq(bookings.findClashes(list, { id: 'n', date: '2026-11-25', startTime: '16:30', durationMin: 30 }), [], 'cancelled slot is free');

  eq(bookings.refundsDue(list).map((b) => b.id), ['c']);
  const settled = bookings.markRefunded(cancelledPaid, 'T2');
  eq([settled.refundDue, settled.refundedAt, settled.status], [false, 'T2', 'cancelled']);
  eq(bookings.refundsDue([live, settled]), []);

  // Status/refund survive normalisation (reload, import, edit form).
  eq(bookings.normalizeBooking(cancelledPaid).status, 'cancelled');
  eq(bookings.normalizeBooking(cancelledPaid).refundDue, true);
  eq(bookings.normalizeBooking({ status: 'weird', refundDue: true }).status, 'booked');
  eq(bookings.normalizeBooking({ status: 'weird', refundDue: true }).refundDue, false, 'refund only on cancelled');
});

test('actions: deletePlayer is refused while the player has refunds due (regression)', () => {
  store.init({ storage: memoryStorage() });
  const p = store.upsert('players', { name: 'Owed', ageGroup: 'U9', archived: true });
  const paid = store.upsert('bookings', bookings.cancelBooking({ playerId: p.id, date: '2026-12-01', startTime: '16:00', price: 30, paid: true }));
  store.upsert('bookings', bookings.cancelBooking({ playerId: p.id, date: '2026-12-02', startTime: '16:00', price: 30, paid: false })); // no refund
  store.upsert('ratings', { playerId: p.id, date: '2026-11-01', scores: { dribbling: 3 } });

  eq(bookings.refundsDueForPlayer(store.getAll('bookings'), p.id).map((b) => b.id), [paid.id]);
  eq(playerDependents(p.id).refundsDue.map((b) => b.id), [paid.id]);
  eq(bookings.refundsDueTotal(store.getAll('bookings').filter((b) => b.playerId === p.id)), 30, 'player page "Refund due"');
  eq(deletePlayer(p.id), false, 'refused');
  assert(store.get('players', p.id), 'player kept');
  eq(store.getAll('bookings').length, 2);
  eq(store.getAll('ratings').length, 1);

  store.upsert('bookings', bookings.markRefunded(store.get('bookings', paid.id)));
  eq(playerDependents(p.id).refundsDue, []);
  eq(bookings.refundsDueTotal(store.getAll('bookings')), 0, 'refunded: no longer due');
  assert(deletePlayer(p.id), 'allowed once refunded');
  eq(store.get('players', p.id), null);
  eq(store.getAll('bookings').length, 0);
});

test('restore: message says cancelled upcoming 1-1s are not restored', () => {
  const list = [
    bookings.cancelBooking({ id: 'a', playerId: 'p', date: '2026-12-01', startTime: '16:00', paid: true }),
    bookings.cancelBooking({ id: 'b', playerId: 'p', date: '2026-12-08', startTime: '16:00' }),
    bookings.cancelBooking({ id: 'c', playerId: 'p', date: '2026-11-01', startTime: '16:00' }), // past: irrelevant
    { id: 'd', playerId: 'p', date: '2026-12-15', startTime: '16:00', status: 'booked' },        // not cancelled
    bookings.cancelBooking({ id: 'e', playerId: 'q', date: '2026-12-01', startTime: '16:00' }), // other player
  ];
  eq(bookings.cancelledUpcomingForPlayer(list, 'p', '2026-11-26', '12:00').map((b) => b.id), ['a', 'b']);
  eq(bookings.restoredMessage('Leo', 0), 'Leo restored to the roster');
  eq(bookings.restoredMessage('Leo', 1), 'Leo restored. Their 1 cancelled 1-1 is not restored: rebook on the 1-1s page if needed.');
  eq(bookings.restoredMessage('Leo', 2), 'Leo restored. Their 2 cancelled 1-1s are not restored: rebook on the 1-1s page if needed.');
});

test('actions: deleteDrill removes from plans; renameAgeGroup updates refs', () => {
  store.init({ storage: memoryStorage() });
  const d = store.upsert('drills', { name: 'a', ageGroups: ['U9'] });
  const s = store.upsert('sessions', { date: '2026-11-01', ageGroup: 'U9', drillIds: [d.id, 'other'], attendance: {} });
  const p = store.upsert('players', { name: 'A', ageGroup: 'U9' });
  renameAgeGroup('U9', 'U9 Girls');
  assert(store.getSettings().ageGroups.includes('U9 Girls') && !store.getSettings().ageGroups.includes('U9'));
  eq(store.get('players', p.id).ageGroup, 'U9 Girls');
  eq(store.get('sessions', s.id).ageGroup, 'U9 Girls');
  eq(store.get('drills', d.id).ageGroups, ['U9 Girls']);
  deleteDrill(d.id);
  eq(store.get('sessions', s.id).drillIds, ['other']);
});

// ---------- backup ----------

test('backup: round trip through validate + replaceAll', () => {
  store.init({ storage: memoryStorage() });
  store.upsert('players', { name: 'A', ageGroup: 'U9' });
  store.updateSettings({ currency: 'EUR' });
  const backup = JSON.parse(JSON.stringify(buildBackup(store.snapshot(), new Date('2026-11-26T10:00:00Z'))));
  const v = validateBackup(backup);
  assert(v.ok, v.errors.join(', '));
  eq(v.counts.players, 1);

  store.init({ storage: memoryStorage() });
  store.replaceAll(backupToState(backup));
  eq(store.getAll('players')[0].name, 'A');
  eq(store.getSettings().currency, 'EUR');
});

// Fakes for exportBackup: a navigator with/without file sharing, and a document that records downloads.
function fakeDoc() {
  const downloads = [];
  return {
    downloads,
    body: { append() {} },
    createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }),
  };
}
function fakeNav({ canShare = true, shareError = null } = {}) {
  const shared = [];
  return {
    shared,
    canShare: ({ files }) => canShare && files.every((f) => f instanceof File),
    share: async (data) => { if (shareError) throw shareError; shared.push(data); },
  };
}
const named = (name) => Object.assign(new Error(name), { name });

test('backup export: share sheet on touch devices, download otherwise (regression)', async () => {
  store.init({ storage: memoryStorage() });
  store.upsert('players', { name: 'A', ageGroup: 'U9' });

  let nav = fakeNav(); let doc = fakeDoc();
  eq(await exportBackup({ nav, doc, preferShare: true }), 'shared');
  eq(nav.shared.length, 1);
  const shared = nav.shared[0].files[0];
  assert(/^academy-coach-backup-\d{4}-\d{2}-\d{2}\.json$/.test(shared.name), shared.name);
  eq(JSON.parse(await shared.text()).players[0].name, 'A');
  eq(doc.downloads.length, 0);
  assert(store.getMeta().lastExportAt, 'counts as a backup');

  // Desktop (no coarse pointer): plain download even if share exists.
  nav = fakeNav(); doc = fakeDoc();
  eq(await exportBackup({ nav, doc, preferShare: false }), 'downloaded');
  eq(nav.shared.length, 0);
  eq(doc.downloads.length, 1);

  // No file sharing support → download.
  doc = fakeDoc();
  eq(await exportBackup({ nav: fakeNav({ canShare: false }), doc, preferShare: true }), 'downloaded');
  eq(doc.downloads.length, 1);
  doc = fakeDoc();
  eq(await exportBackup({ nav: {}, doc, preferShare: true }), 'downloaded');

  // Share fails for another reason → falls back to download.
  doc = fakeDoc();
  eq(await exportBackup({ nav: fakeNav({ shareError: named('NotAllowedError') }), doc, preferShare: true }), 'downloaded');
  eq(doc.downloads.length, 1);

  // User cancels the sheet → nothing downloaded, not recorded as a backup.
  store.init({ storage: memoryStorage() });
  doc = fakeDoc();
  eq(await exportBackup({ nav: fakeNav({ shareError: named('AbortError') }), doc, preferShare: true }), 'cancelled');
  eq(doc.downloads.length, 0);
  eq(store.getMeta().lastExportAt, null);
});

test('backup: rejects bad files', () => {
  assert(!validateBackup(null).ok);
  assert(!validateBackup([]).ok);
  assert(!validateBackup({ app: 'other', schemaVersion: 1 }).ok);
  assert(!validateBackup({ schemaVersion: 1, players: 'nope' }).ok);
  assert(!validateBackup({ schemaVersion: 1, players: [{ name: 'no id' }] }).ok);
  assert(!validateBackup({ schemaVersion: 99 }).ok);
  assert(validateBackup({ schemaVersion: 1 }).ok, 'empty but valid');
  eq(backupFilename('2026-11-26'), 'academy-coach-backup-2026-11-26.json');
});
