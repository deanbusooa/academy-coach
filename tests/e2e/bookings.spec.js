import { test, expect } from '@playwright/test';
import { loadDemo, isoDaysFromToday, savedState } from './helpers.js';

async function openNewBooking(page, { player, date, start }) {
  await page.goto(`/#/bookings?week=${date}`);
  await page.getByRole('button', { name: 'Add booking', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Player').selectOption({ label: player });
  await dialog.getByLabel('Date').fill(date);
  await dialog.getByLabel('Start').fill(start);
  return dialog;
}

const earlyBookings = async (page, date) => (await savedState(page)).bookings.filter((b) => b.date === date && b.startTime.startsWith('06:'));

test('an overlapping 1-1 is not saved until "Book anyway" is confirmed (regression)', async ({ page }) => {
  await loadDemo(page);
  const date = await isoDaysFromToday(page, 2);
  let dialog = await openNewBooking(page, { player: 'Ava Okafor (U9)', date, start: '06:00' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  dialog = await openNewBooking(page, { player: 'Sam Patel (U9)', date, start: '06:30' });
  await dialog.getByRole('button', { name: 'Save' }).click();

  // Clash shown in the form; nothing saved yet.
  const warning = dialog.locator('.form-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('role', 'alert');
  await expect(warning).toContainText('This overlaps 1 other 1-1');
  await expect(warning).toContainText('Ava Okafor');
  await expect(warning).toContainText('06:00–07:00');
  expect(await earlyBookings(page, date)).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Book anyway' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await earlyBookings(page, date)).toHaveLength(2);

  // Reminder toast is info-styled with a warning icon (it did save).
  const toast = page.locator('.toast', { hasText: 'overlapping 1 other 1-1' });
  await expect(toast).toBeVisible();
  await expect(toast).not.toHaveClass(/\berror\b/);
  await expect(toast).toHaveAttribute('data-icon', 'warning');
});

test('changing the time after a clash warning re-checks: a free slot saves normally', async ({ page }) => {
  await loadDemo(page);
  const date = await isoDaysFromToday(page, 2);
  let dialog = await openNewBooking(page, { player: 'Ava Okafor (U9)', date, start: '06:00' });
  await dialog.getByRole('button', { name: 'Save' }).click();

  dialog = await openNewBooking(page, { player: 'Sam Patel (U9)', date, start: '06:30' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.locator('.form-warning')).toBeVisible();

  await dialog.getByLabel('Start').fill('07:00'); // Ava ends at 07:00: no overlap
  await expect(dialog.locator('.form-warning')).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Book anyway' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'overlapping' })).toHaveCount(0);
});
