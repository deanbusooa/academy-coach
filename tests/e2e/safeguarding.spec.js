// 1-1 bookings carry safeguarding details: responsible adult and drop-off/collection.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, isoDaysFromToday, trackErrors } from './helpers.js';

test('booking form: responsible adult defaults to the parent, follows the player, and saves with handover notes', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  const date = await isoDaysFromToday(page, 4);
  await page.goto(`/#/bookings?week=${date}`);
  await page.getByRole('button', { name: 'Add booking', exact: true }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.locator('.safeguarding-note')).toContainText("academy's safeguarding policy applies");
  const adult = dialog.getByLabel('Responsible adult');
  await expect(adult).toHaveValue(''); // no player chosen yet

  await dialog.getByLabel('Player').selectOption({ label: 'Leo Martins (U9)' });
  await expect(adult).toHaveValue('Ana Martins (+61 491 570 156)');
  await dialog.getByLabel('Player').selectOption({ label: 'Ava Okafor (U9)' });
  await expect(adult).toHaveValue('Chidi Okafor (+61 491 570 157)'); // follows the player

  await adult.fill('Grandad Joe (+61 491 570 999)');
  await dialog.getByLabel('Player').selectOption({ label: 'Leo Martins (U9)' });
  await expect(adult).toHaveValue('Grandad Joe (+61 491 570 999)'); // own entry is kept

  await dialog.getByLabel('Date').fill(date);
  await dialog.getByLabel('Start').fill('05:30');
  await dialog.getByLabel('Drop-off / collection').fill('Grandad drops off and collects at the car park');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  const saved = (await savedState(page)).bookings.find((b) => b.date === date && b.startTime === '05:30');
  expect(saved.responsibleAdult).toBe('Grandad Joe (+61 491 570 999)');
  expect(saved.handover).toBe('Grandad drops off and collects at the car park');

  // Shown again when editing.
  await page.locator('.booking', { hasText: '05:30' }).getByRole('button', { name: /Edit booking/ }).click();
  await expect(page.getByRole('dialog').getByLabel('Drop-off / collection')).toHaveValue('Grandad drops off and collects at the car park');
  errs.expectNone();
});

test('booking from a player page prefills their parent as responsible adult', async ({ page }) => {
  await loadDemo(page);
  const zara = (await savedState(page)).players.find((p) => p.name === 'Zara Ali');
  await page.goto(`/#/players/${zara.id}`);
  await page.getByRole('button', { name: 'Book 1-1' }).click();
  await expect(page.getByRole('dialog').getByLabel('Responsible adult')).toHaveValue('Omar Ali (+61 491 570 006)');
});
