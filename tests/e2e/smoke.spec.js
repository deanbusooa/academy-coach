// The manual testing checklist from CLAUDE.md, automated.
import { test, expect } from '@playwright/test';
import { trackErrors, loadDemo, savedState, isoDaysFromToday } from './helpers.js';

test('coach workflow: roster → session → register → 1-1 → rating → backup round trip', async ({ page }, testInfo) => {
  // ~40 steps end to end: on CI's WebKit runner this ran out of the default
  // 30 s at its last step. 3× budget for this one test; others keep 30 s.
  test.slow();
  const errs = trackErrors(page);
  await loadDemo(page);
  await expect(page.locator('.list .title')).toHaveCount(8);

  // --- Add a player; empty submit shows validation first.
  await page.getByRole('button', { name: 'Add player' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.locator('.field.invalid')).toHaveCount(2);
  await dialog.getByLabel('Full name').fill('Test Kid');
  await dialog.getByLabel('Age group').selectOption('U9');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/players\/.+/);
  await expect(page.getByRole('heading', { level: 2, name: 'Test Kid' })).toBeVisible();
  await expect(page.getByText(/^Joined /)).toBeVisible(); // joinedOn defaults to today

  // --- Plan a session, add two drills, reorder.
  await page.goto('/#/sessions');
  await page.getByRole('button', { name: 'Plan session' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Age group').selectOption('U9');
  await dialog.getByRole('button', { name: 'Create & add drills' }).click();
  await expect(page).toHaveURL(/#\/sessions\/.+/);

  await page.getByRole('button', { name: 'Add drills' }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('.picker-item input').nth(0).check();
  await dialog.locator('.picker-item input').nth(1).check();
  await dialog.getByRole('button', { name: 'Add 2 drills' }).click();
  const titles = page.locator('.drill summary .title');
  await expect(titles).toHaveCount(2);
  const first = (await titles.nth(0).textContent()).trim();
  await page.getByRole('button', { name: `Move ${first} down` }).click();
  await expect(titles.nth(1)).toHaveText(first);

  // --- Register: tap cycles, "All present".
  const tile = page.locator('.att-tile', { hasText: 'Test Kid' });
  await tile.click();
  await expect(tile).toContainText('Present');
  await tile.click();
  await expect(tile).toContainText('Late');
  await page.getByRole('button', { name: 'All present' }).click();
  await expect(page.locator('.att-tile.is-present')).toHaveCount(6);

  // --- 1-1 booking, toggle paid, change week.
  await page.goto('/#/bookings');
  await page.getByRole('button', { name: 'Add booking', exact: true }).click(); // the FAB (day buttons say "Add booking on …")
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Player').selectOption({ label: 'Test Kid (U9)' });
  await dialog.getByLabel('Start').fill('19:15');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const card = page.locator('.booking', { hasText: 'Test Kid' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Mark as paid' }).click();
  await expect(card).toHaveClass(/is-paid/);
  await page.getByRole('link', { name: 'Next week' }).click();
  await expect(page).toHaveURL(/week=/);
  await expect(page.locator('.booking', { hasText: 'Test Kid' })).toHaveCount(0);

  // --- Two ratings on different dates → trend chart.
  await page.goto('/#/players');
  await page.getByRole('link', { name: /Test Kid/ }).click();
  await page.locator('.quick-actions').getByRole('link', { name: 'Progress' }).click();
  await page.getByRole('button', { name: 'Add first rating' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date').fill(await isoDaysFromToday(page, -14));
  await dialog.getByRole('button', { name: 'Dribbling 2' }).click();
  await dialog.getByRole('button', { name: 'Save rating' }).click();
  await page.getByRole('button', { name: 'Rate now' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Dribbling 4' }).click();
  await dialog.getByRole('button', { name: 'Save rating' }).click();
  await expect(page.locator('.chart .chart-line')).toHaveCount(1);
  await expect(page.locator('.delta.up')).toHaveText('+2');

  // --- Export → reset → import restores everything.
  const before = await savedState(page);
  await page.goto('/#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await downloadPromise).saveAs(file);

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
  await page.goto('/#/players');
  await expect(page.getByText('No players yet')).toBeVisible();

  await page.goto('/#/settings');
  await page.locator('#import-file').setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Replace data' }).click();
  await page.goto('/#/players');
  await expect(page.locator('.list .title')).toHaveCount(9);
  const after = await savedState(page);
  // Import normalises records (e.g. adds defaults), so compare what matters.
  const pick = (list, keys) => list.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
  expect(pick(after.players, ['id', 'name', 'ageGroup', 'parentPhone'])).toEqual(pick(before.players, ['id', 'name', 'ageGroup', 'parentPhone']));
  expect(pick(after.ratings, ['id', 'playerId', 'date', 'scores'])).toEqual(pick(before.ratings, ['id', 'playerId', 'date', 'scores']));
  expect(pick(after.bookings, ['id', 'playerId', 'date', 'startTime', 'paid'])).toEqual(pick(before.bookings, ['id', 'playerId', 'date', 'startTime', 'paid']));
  expect(pick(after.sessions, ['id', 'drillIds', 'attendance'])).toEqual(pick(before.sessions, ['id', 'drillIds', 'attendance']));

  // --- Data survives a reload.
  await page.reload();
  await expect(page.locator('.list .title')).toHaveCount(9);

  errs.expectNone();
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('app shell loads with no network once installed', async ({ page, context }) => {
    await loadDemo(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the service worker
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#nav a')).toHaveCount(6);
    await page.goto('/#/bookings');
    await expect(page.getByRole('heading', { name: '1-1 sessions', exact: true })).toBeVisible();
  });
});

test('demo data is only offered on a completely empty app', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Load demo data' })).toBeVisible();

  // A coach who has only built a drill (no players yet) must not be offered demo data.
  await page.goto('/#/drills');
  await page.getByRole('button', { name: 'Add first drill' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Drill name').fill('My rondo');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load demo data' })).toHaveCount(0);
});

test('player notes do not prompt for medical details', async ({ page }) => {
  await page.goto('/#/players');
  await page.getByRole('button', { name: 'Add first player' }).click();
  const notes = page.getByRole('dialog').getByLabel('Notes');
  await expect(notes).toBeVisible();
  expect(await notes.getAttribute('placeholder')).not.toMatch(/medical|health|allerg|condition/i);
  await expect(page.getByRole('dialog')).toContainText('unencrypted');
});

test('rating twice on the same date replaces it instead of adding a point (regression)', async ({ page }) => {
  await loadDemo(page);
  const leo = (await savedState(page)).players.find((p) => p.name === 'Leo Martins');
  const count = async () => (await savedState(page)).ratings.filter((r) => r.playerId === leo.id).length;
  await page.goto(`/#/progress/${leo.id}`);
  const before = await count();

  const history = page.locator('.section-label', { hasText: 'History' }).locator('xpath=following-sibling::ul[1]/li');
  await expect(history).toHaveCount(before);

  await page.getByRole('button', { name: 'Rate now' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Shooting 2' }).click();
  await dialog.getByRole('button', { name: 'Save rating' }).click();
  await expect(history).toHaveCount(before + 1);

  // Same date again: the form warns, and saving replaces.
  await page.getByRole('button', { name: 'Rate now' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('already has a rating on');
  await dialog.getByRole('button', { name: 'Shooting 5' }).click();
  await dialog.getByRole('button', { name: 'Save rating' }).click();
  await expect(page.getByText(/Replaced Leo Martins's rating/)).toBeVisible();
  await expect(history).toHaveCount(before + 1);
  expect(await count()).toBe(before + 1);

  const today = (await savedState(page)).ratings.filter((r) => r.playerId === leo.id).at(-1);
  expect(today.scores.shooting).toBe(5);
  // One dot per date on the shooting line.
  const dots = await page.locator('.chart-series').nth(3).locator('.chart-dot').count();
  expect(dots).toBe(before + 1);
});
