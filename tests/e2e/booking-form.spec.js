// Edit form: a paid 1-1 is cancelled (refund due), never deleted; an unpaid one can be deleted.
import { test, expect } from '@playwright/test';
import { loadDemo, isoDaysFromToday, savedState, trackErrors } from './helpers.js';

async function newBooking(page, { date, start, paid }) {
  await page.goto(`/#/bookings?week=${date}`);
  await page.getByRole('button', { name: 'Add booking', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Player').selectOption({ label: 'Mia Novak (U9)' });
  await dialog.getByLabel('Date').fill(date);
  await dialog.getByLabel('Start').fill(start);
  if (paid) await dialog.getByLabel('Paid').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  return page.locator('.booking', { hasText: start });
}

test('paid booking: form offers "Cancel (refund due)", not Delete', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  const date = await isoDaysFromToday(page, 3);
  const card = await newBooking(page, { date, start: '06:15', paid: true });

  await card.getByRole('button', { name: /Edit booking/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Cancel (refund due)' }).click();
  const confirm = page.getByRole('dialog').last();
  await expect(confirm).toContainText('Refunds due');
  await confirm.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.locator('.booking', { hasText: '06:15' })).toHaveCount(0);
  await expect(page.locator('.refunds-card .list-item', { hasText: 'Mia Novak' })).toHaveCount(1);
  const b = (await savedState(page)).bookings.find((x) => x.date === date && x.startTime === '06:15');
  expect([b.status, b.refundDue]).toEqual(['cancelled', true]);
  errs.expectNone();
});

test('unpaid booking: form offers Delete', async ({ page }) => {
  await loadDemo(page);
  const date = await isoDaysFromToday(page, 3);
  const card = await newBooking(page, { date, start: '06:45', paid: false });
  await card.getByRole('button', { name: /Edit booking/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByRole('button', { name: 'Cancel (refund due)' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.booking', { hasText: '06:45' })).toHaveCount(0);
  expect((await savedState(page)).bookings.find((x) => x.startTime === '06:45')).toBeUndefined();
});

test('past paid booking: no cancel, only "Delete (entered by mistake)" with a no-refund warning', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  const date = await isoDaysFromToday(page, -2);
  const card = await newBooking(page, { date, start: '06:20', paid: true });

  await card.getByRole('button', { name: /Edit booking/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByRole('button', { name: 'Cancel (refund due)' })).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  const del = form.getByRole('button', { name: 'Delete (entered by mistake)' });
  await expect(del).toBeVisible();

  await del.click();
  const confirm = page.getByRole('dialog').last();
  await expect(confirm).toContainText('no refund is recorded');
  // Backing out keeps it.
  await confirm.getByRole('button', { name: 'Keep booking' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);

  await del.click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Delete, no refund' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.booking', { hasText: '06:20' })).toHaveCount(0);
  const state = await savedState(page);
  expect(state.bookings.find((b) => b.date === date && b.startTime === '06:20')).toBeUndefined();
  await expect(page.locator('.refunds-card')).toHaveCount(0);
  errs.expectNone();
});
