// Regression: two open tabs must not overwrite each other's data.
import { test, expect } from '@playwright/test';
import { trackErrors, savedState } from './helpers.js';

async function addPlayer(page, name) {
  await page.getByRole('button', { name: 'Add player' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill(name);
  await dialog.getByLabel('Age group').selectOption('U9');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/players\/.+/);
}

test('a write in tab B keeps the player tab A just added', async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  const errsA = trackErrors(tabA);
  const errsB = trackErrors(tabB);
  await tabA.goto('/#/players');
  await tabB.goto('/#/players');

  await addPlayer(tabA, 'Alpha Tab');

  // Tab B picks up the change live, without a reload.
  await expect(tabB.locator('.list .title')).toHaveText(['Alpha Tab']);

  await addPlayer(tabB, 'Bravo Tab');

  const names = (await savedState(tabA)).players.map((p) => p.name).sort();
  expect(names).toEqual(['Alpha Tab', 'Bravo Tab']);

  await tabA.goto('/#/players');
  await expect(tabA.locator('.list .title')).toHaveText(['Alpha Tab', 'Bravo Tab']);

  errsA.expectNone();
  errsB.expectNone();
});
