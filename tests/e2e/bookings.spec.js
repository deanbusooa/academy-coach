import { test, expect } from '@playwright/test';
import { loadDemo, isoDaysFromToday, savedState } from './helpers.js';

async function book(page, { player, date, start }) {
  await page.goto(`/#/bookings?week=${date}`);
  await page.getByRole('button', { name: 'Add booking', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Player').selectOption({ label: player });
  await dialog.getByLabel('Date').fill(date);
  await dialog.getByLabel('Start').fill(start);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

test('an overlapping booking saves with an info toast and a warning icon, not an error (regression)', async ({ page }) => {
  await loadDemo(page);
  const date = await isoDaysFromToday(page, 2);
  await book(page, { player: 'Ava Okafor (U9)', date, start: '06:00' });
  await book(page, { player: 'Sam Patel (U9)', date, start: '06:30' });

  const toast = page.locator('.toast', { hasText: 'overlaps 1 other booking' });
  await expect(toast).toBeVisible();
  await expect(toast).not.toHaveClass(/\berror\b/);
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toHaveAttribute('data-icon', 'warning');
  await expect(toast.locator('svg.toast-icon')).toHaveCount(1);

  // It really saved.
  const saved = (await savedState(page)).bookings.filter((b) => b.date === date && b.startTime.startsWith('06:'));
  expect(saved).toHaveLength(2);
});
