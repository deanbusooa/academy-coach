// Settings → Your data: what is stored and where, and deleting long-archived players.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, trackErrors, STORAGE_KEY } from './helpers.js';

test('"Your data" panel explains what is stored, where, and how to delete it', async ({ page }) => {
  await loadDemo(page);
  await page.goto('/#/settings');
  const panel = page.locator('.your-data');
  await expect(panel.getByRole('heading', { name: 'Your data' })).toBeVisible();
  for (const h of ['What is stored', 'Where', 'How to delete', 'Archived players']) {
    await expect(panel.getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(panel).toContainText('Players (8, 0 archived)');
  await expect(panel).toContainText('Only in this browser, on this device');
  await expect(panel).toContainText('Delete all data');
});

test('delete archived players older than N months', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  // Two players archived ~18 months ago, one last month.
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key));
    const at = (monthsBack) => { const d = new Date(); d.setMonth(d.getMonth() - monthsBack); return d.toISOString(); };
    const set = (name, months) => Object.assign(s.players.find((p) => p.name === name), { archived: true, archivedAt: at(months) });
    set('Sam Patel', 18); set('Noah Kim', 18); set('Zara Ali', 1);
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);
  await page.goto('/#/settings');
  await page.reload();

  const panel = page.locator('.your-data');
  await page.locator('#retention-months').selectOption('24');
  await expect(panel.getByRole('button', { name: 'None to delete' })).toBeDisabled();
  await page.locator('#retention-months').focus(); // as a keyboard user would
  await page.locator('#retention-months').selectOption('12');
  await expect(page.locator('#retention-months')).toBeFocused(); // focus kept after re-render
  await panel.getByRole('button', { name: 'Delete 2 archived players' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Archived more than 12 months ago');
  await expect(confirm).toContainText('Noah Kim');
  await expect(confirm).toContainText('Sam Patel');
  await confirm.getByRole('button', { name: 'Delete permanently' }).click();

  const names = (await savedState(page)).players.map((p) => p.name);
  expect(names).not.toContain('Sam Patel');
  expect(names).not.toContain('Noah Kim');
  expect(names).toContain('Zara Ali'); // archived recently: kept
  expect(names).toHaveLength(6);
  await expect(panel.getByRole('button', { name: 'None to delete' })).toBeVisible();
  errs.expectNone();
});
