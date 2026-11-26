// Regression: on phones, export goes through the share sheet (iOS home-screen
// apps ignore <a download>); on desktop it stays a normal download.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState } from './helpers.js';

// Stand-in for the OS share sheet: records what it was given.
function stubShare() {
  window.__shared = [];
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => Boolean(d?.files?.length) });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (d) => { window.__shared.push({ name: d.files[0].name, text: await d.files[0].text() }); },
  });
}

test('phone: Export backup opens the share sheet with the JSON file', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'touch devices only');
  await page.addInitScript(stubShare);
  await loadDemo(page);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

  await page.goto('/#/settings');
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.getByRole('button', { name: 'Export backup' }).click();
  await expect(page.getByText('Backup shared')).toBeVisible();

  const shared = await page.evaluate(() => window.__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0].name).toMatch(/^academy-coach-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(shared[0].text).players).toHaveLength(8);
  expect(downloaded).toBe(false);
  expect((await savedState(page)).meta.lastExportAt).toBeTruthy();
});

test('desktop: Export backup downloads even when share is available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only');
  await page.addInitScript(stubShare);
  await loadDemo(page);
  await page.goto('/#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/^academy-coach-backup-.*\.json$/);
  expect(await page.evaluate(() => window.__shared.length)).toBe(0);
});
