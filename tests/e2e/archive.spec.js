// Archiving a player cancels (not deletes) their upcoming 1-1s after confirming;
// paid ones become refunds to settle. Past bookings are untouched.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, isoDaysFromToday, trackErrors } from './helpers.js';

test('archive cancels upcoming 1-1s, keeps them on record, and tracks refunds', async ({ page }) => {
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
  const paidUpcoming = before.filter((b) => upcomingIds.includes(b.id) && b.paid);
  expect(paidUpcoming.length).toBeGreaterThan(0);

  // Tomorrow's session is on the calendar before archiving.
  const tomorrowWeek = `/#/bookings?week=${tomorrow}`;
  await page.goto(tomorrowWeek);
  await expect(page.locator('.booking', { hasText: '07:30' })).toHaveCount(1);
  await page.goto(`/#/players/${leo.id}`);

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText(`Their ${upcomingIds.length} upcoming 1-1 session`);
  await expect(dialog).toContainText('Refunds due');

  // Cancelling the confirm leaves everything as it was, and the edit sheet open.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect((await savedState(page)).bookings.filter((b) => b.playerId === leo.id)).toHaveLength(before.length);

  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: /^Archive & cancel/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.archived-banner')).toBeVisible();

  // Nothing deleted: upcoming → cancelled (+ refundDue if paid), past untouched.
  const after = (await savedState(page)).bookings.filter((b) => b.playerId === leo.id);
  expect(after.map((b) => b.id).sort()).toEqual(before.map((b) => b.id).sort());
  for (const b of after) {
    if (upcomingIds.includes(b.id)) {
      expect(b.status).toBe('cancelled');
      expect(b.refundDue).toBe(Boolean(b.paid));
    } else {
      expect(b.status ?? 'booked').toBe('booked');
    }
  }

  // Off the calendar; listed under Refunds due until marked refunded.
  await page.goto(tomorrowWeek);
  await expect(page.locator('.booking', { hasText: '07:30' })).toHaveCount(0);
  const refunds = page.locator('.refunds-card');
  await expect(refunds.getByRole('heading', { name: 'Refunds due' })).toBeVisible();
  await expect(refunds.locator('.list-item')).toHaveCount(paidUpcoming.length);
  await refunds.locator('.list-item', { hasText: 'Leo Martins' }).first().getByRole('button', { name: /Mark refunded/ }).click();
  await expect(refunds.locator('.list-item')).toHaveCount(paidUpcoming.length - 1);
  const settled = (await savedState(page)).bookings.filter((b) => b.refundedAt);
  expect(settled).toHaveLength(1);
  expect(settled[0].refundDue).toBe(false);

  // Restoring says the cancelled 1-1s stay cancelled, and doesn't rebook them.
  await page.goto(`/#/players/${leo.id}`);
  await page.locator('.archived-banner').getByRole('button', { name: 'Restore to roster' }).click();
  const toast = page.locator('.toast', { hasText: 'restored' });
  await expect(toast).toContainText(`Their ${upcomingIds.length} cancelled 1-1`);
  await expect(toast).toContainText('not restored');
  const restored = (await savedState(page)).bookings.filter((b) => upcomingIds.includes(b.id));
  expect(restored.every((b) => b.status === 'cancelled')).toBe(true);
  errs.expectNone();
});
