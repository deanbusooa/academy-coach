// Regression: removing an age group explains which players (active/archived) block it.
import { test, expect } from '@playwright/test';

test('age group with only an archived player explains why it cannot be removed', async ({ page }) => {
  // One U7 player, then archive them.
  await page.goto('/#/players');
  await page.getByRole('button', { name: 'Add first player' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Old Player');
  await dialog.getByLabel('Age group').selectOption('U7');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('.archived-banner')).toBeVisible();

  await page.goto('/#/settings');
  const row = page.locator('.list-item', { has: page.locator('.title', { hasText: /^U7$/ }) });
  await expect(row.locator('.sub')).toHaveText('0 players · 1 archived');

  await row.getByRole('button', { name: 'Remove U7' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveText("Can't remove U7 yet");
  await expect(dialog).toContainText('U7 still has 1 archived player.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(row).toBeVisible(); // not removed

  // An unused group is removed straight away.
  const u6 = page.locator('.list-item', { has: page.locator('.title', { hasText: /^U6$/ }) });
  await u6.getByRole('button', { name: 'Remove U6' }).click();
  await expect(u6).toHaveCount(0);
});
