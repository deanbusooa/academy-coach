// Sample data so a coach can try the app before entering a real squad.

import * as store from './store.js';
import { todayISO, addDays, startOfWeek } from './utils/date.js';

/**
 * Only into a completely empty store, so sample players/drills never mix with
 * real data (e.g. a coach who has drills but no players yet).
 * @returns {boolean} false if data already exists or the save failed
 */
export function loadDemoData(today = todayISO()) {
  if (!store.isEmpty()) return false;
  return store.batch(() => {
    const P = (name, ageGroup, position, parentName, parentPhone) =>
      store.upsert('players', { name, ageGroup, position, parentName, parentPhone, parentEmail: '', notes: '' });

    const u9 = [
      P('Leo Martins', 'U9', 'Forward', 'Ana Martins', '+61 491 570 156'),
      P('Ava Okafor', 'U9', 'Midfielder', 'Chidi Okafor', '+61 491 570 157'),
      P('Sam Patel', 'U9', 'Defender', 'Priya Patel', '+61 491 570 158'),
      P('Mia Novak', 'U9', 'Goalkeeper', 'Petr Novak', '+61 491 570 159'),
      P('Noah Kim', 'U9', 'Midfielder', 'Jin Kim', '+61 491 570 110'),
    ];
    const u11 = [
      P('Ella Reid', 'U11', 'Forward', 'Tom Reid', '+61 491 570 313'),
      P('Kai Mensah', 'U11', 'Defender', 'Akosua Mensah', '+61 491 570 737'),
      P('Zara Ali', 'U11', 'Midfielder', 'Omar Ali', '+61 491 570 006'),
    ];

    const D = (name, durationMin, equipment, coachingPoints, ageGroups = []) =>
      store.upsert('drills', { name, durationMin, equipment, coachingPoints, ageGroups, notes: '' });
    const drills = [
      D('Dynamic warm-up', 10, ['Cones'], ['Gradual intensity', 'Ball at feet where possible']),
      D('Rondo 4v1', 15, ['Cones', 'Bibs', 'Balls'], ['Open body shape', 'Pass into space, not feet', 'Move after you pass']),
      D('Dribble gates', 15, ['20 cones', 'Ball each'], ['Small touches', 'Head up', 'Change of pace through the gate'], ['U7', 'U8', 'U9', 'U10']),
      D('1v1 to goal', 15, ['Pop-up goals', 'Balls', 'Cones'], ['Attack the front foot', 'Commit the defender', 'Finish early']),
      D('Passing triangles', 12, ['Cones', 'Balls'], ['Receive on the back foot', 'Weight of pass', 'Communicate']),
      D('Small-sided game 4v4', 20, ['Bibs', 'Pop-up goals', 'Balls'], ['Let them play', 'Freeze to coach one moment']),
    ];

    const S = (date, ageGroup, title, drillIdx, attendance = {}) =>
      store.upsert('sessions', {
        date, time: '17:00', ageGroup, location: 'Pitch 2', title, notes: '',
        drillIds: drillIdx.map((i) => drills[i].id), attendance,
      });
    S(addDays(today, -7), 'U9', 'Dribbling & 1v1s', [0, 2, 3, 5],
      Object.fromEntries(u9.map((p, i) => [p.id, i === 4 ? 'absent' : i === 2 ? 'late' : 'present'])));
    S(addDays(today, -3), 'U11', 'Keeping possession', [0, 1, 4, 5],
      Object.fromEntries(u11.map((p) => [p.id, 'present'])));
    S(addDays(today, 2), 'U9', 'Passing & receiving', [0, 4, 1, 5]);

    const wk = startOfWeek(today);
    const B = (player, date, startTime, focusArea, paid) =>
      store.upsert('bookings', { playerId: player.id, date, startTime, durationMin: 60, focusArea, price: 30, paid, location: '', notes: '' });
    B(u9[0], addDays(wk, -6), '16:00', 'Finishing', true);
    B(u11[0], addDays(wk, -5), '17:00', 'Weak foot', false);
    B(u9[0], addDays(wk, 1), '16:00', 'Shooting', false);
    B(u9[1], addDays(wk, 3), '17:30', 'First touch', true);
    B(u11[2], addDays(wk, 5), '10:00', 'Passing', false);

    const R = (player, date, scores, notes = '') => store.upsert('ratings', { playerId: player.id, date, scores, notes });
    R(u9[0], addDays(today, -56), { dribbling: 2, passing: 2, firstTouch: 2, shooting: 3, defending: 1, fitness: 3 });
    R(u9[0], addDays(today, -28), { dribbling: 3, passing: 2, firstTouch: 3, shooting: 3, defending: 2, fitness: 3 });
    R(u9[0], addDays(today, -2), { dribbling: 4, passing: 3, firstTouch: 3, shooting: 4, defending: 2, fitness: 4 }, 'Much braver on the ball.');
    R(u9[1], addDays(today, -40), { dribbling: 3, passing: 3, firstTouch: 2, shooting: 2, defending: 3, fitness: 4 });
    R(u9[1], addDays(today, -5), { dribbling: 3, passing: 4, firstTouch: 3, shooting: 2, defending: 3, fitness: 4 });
    R(u11[0], addDays(today, -10), { dribbling: 4, passing: 3, firstTouch: 4, shooting: 4, defending: 2, fitness: 3 });
  });
}
