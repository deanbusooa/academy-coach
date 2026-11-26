// Permanent delete is blocked while the player has refunds due.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, isoDaysFromToday, trackErrors } from './helpers.js';

test('cannot permanently delete a player with refunds due until they are marked refunded', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  const mia = (await savedState(page)).players.find((p) => p.name === 'Mia Novak');

  // A paid 1-1 tomorrow, then archive: it becomes a refund due.
  await page.goto(`/#/players/${mia.id}`);
  await page.getByRole('button', { name: 'Book 1-1' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Date').fill(await isoDaysFromToday(page, 1));
  await dialog.getByLabel('Start').fill('07:00');
  await dialog.getByLabel('Paid').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: /^Archive & cancel/ }).click();
  await expect(page.locator('.archived-banner')).toBeVisible();

  // Delete is refused, listing what's owed.
  await page.getByRole('button', { name: 'Delete permanently…' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveText("Can't delete Mia Novak yet");
  await expect(dialog).toContainText('1 refund still due');
  await expect(dialog).toContainText('07:00');
  await dialog.getByRole('button', { name: 'Open Refunds due' }).click();
  await expect(page).toHaveURL(/#\/bookings/);
  expect((await savedState(page)).players.some((p) => p.id === mia.id)).toBe(true);

  // Settle it, then delete works.
  await page.locator('.refunds-card .list-item', { hasText: 'Mia Novak' }).getByRole('button', { name: /Mark refunded/ }).click();
  await page.goto(`/#/players/${mia.id}`);
  await page.getByRole('button', { name: 'Delete permanently…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page).toHaveURL(/#\/players$/);
  expect((await savedState(page)).players.some((p) => p.id === mia.id)).toBe(false);
  errs.expectNone();
});
