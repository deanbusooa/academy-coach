// Archiving a player cancels their upcoming 1-1s (after confirming) and keeps the past.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, isoDaysFromToday, trackErrors } from './helpers.js';

test('archive asks, then cancels upcoming 1-1s and keeps past ones', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  const leo = (await savedState(page)).players.find((p) => p.name === 'Leo Martins');

  // Book Leo for tomorrow (paid) so there is definitely something upcoming.
  const tomorrow = await isoDaysFromToday(page, 1);
  await page.goto(`/#/players/${leo.id}`);
  await page.getByRole('button', { name: 'Book 1-1' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date').fill(tomorrow);
  await dialog.getByLabel('Start').fill('07:30');
  await dialog.getByLabel('Paid').check();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const before = (await savedState(page)).bookings.filter((b) => b.playerId === leo.id);
  const isUpcoming = (b, today, time) => b.date > today || (b.date === today && b.startTime > time);
  const today = await isoDaysFromToday(page, 0);
  const time = await page.evaluate(() => new Date().toTimeString().slice(0, 5));
  const upcomingIds = before.filter((b) => isUpcoming(b, today, time)).map((b) => b.id);
  const pastIds = before.filter((b) => !isUpcoming(b, today, time)).map((b) => b.id);
  expect(upcomingIds.length).toBeGreaterThan(0);
  expect(pastIds.length).toBeGreaterThan(0); // demo has a past paid session

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText(`Their ${upcomingIds.length} upcoming 1-1 session`);
  await expect(dialog).toContainText('remember to refund');

  // Cancelling the confirm leaves everything as it was, and the edit sheet open.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect((await savedState(page)).bookings.filter((b) => b.playerId === leo.id)).toHaveLength(before.length);

  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: /^Archive & cancel/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.archived-banner')).toBeVisible();

  const after = (await savedState(page)).bookings.filter((b) => b.playerId === leo.id).map((b) => b.id);
  expect(after.sort()).toEqual(pastIds.sort());
  errs.expectNone();
});
