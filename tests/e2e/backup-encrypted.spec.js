// Encrypted backup round trip, older-backup warning, and undo import.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, trackErrors } from './helpers.js';

const PASS = 'correct horse 1';

test('encrypted export → import with passphrase (wrong then right) → older-backup warning → undo import', async ({ page }, testInfo) => {
  test.slow(); // real PBKDF2 (600k iterations) twice, plus a long flow
  const errs = trackErrors(page);
  await loadDemo(page);

  // --- Export encrypted
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Export encrypted…' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Passphrase', { exact: true }).fill(PASS);
  await dialog.getByLabel('Repeat passphrase').fill('something else');
  await dialog.getByRole('button', { name: 'Encrypt' }).click();
  await expect(dialog.locator('.error')).toHaveText('The passphrases do not match.');
  await dialog.getByLabel('Repeat passphrase').fill(PASS);
  await dialog.getByRole('button', { name: 'Encrypt' }).click();
  await expect(dialog).toContainText('Encrypted. Now save the file.');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save file' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.encrypted\.json$/);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  expect(JSON.parse(text).encrypted).toBe(true);
  expect(text).not.toContain('Leo Martins');
  expect(text).not.toContain('491 570');

  // --- A change after the backup, so the backup is older than local data
  await page.goto('/#/players');
  await page.getByRole('button', { name: 'Add player' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('After Backup');
  await dialog.getByLabel('Age group').selectOption('U9');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/players\/.+/);

  // --- Import: passphrase prompt
  await page.goto('/#/settings');
  await page.locator('#import-file').setInputFiles(file);
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This backup is encrypted');
  await dialog.getByLabel('Passphrase').fill('not the passphrase');
  await dialog.getByRole('button', { name: 'Unlock' }).click();
  await expect(dialog.locator('.error')).toHaveText('Wrong passphrase, or the file is damaged.');
  await dialog.getByLabel('Passphrase').fill(PASS);
  await dialog.getByRole('button', { name: 'Unlock' }).click();

  // --- Confirm shows both dates and warns the backup is older
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByRole('heading')).toHaveText('Replace all data?');
  await expect(confirm).toContainText('Backup exported:');
  await expect(confirm).toContainText('Latest change on this device:');
  await expect(confirm).toContainText('OLDER than the data on this device');
  await expect(confirm).toContainText('kept as an undo copy');
  await confirm.getByRole('button', { name: 'Replace data' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await savedState(page)).players.map((p) => p.name)).not.toContain('After Backup');

  // --- Undo the import
  const undo = page.locator('.undo-import');
  await expect(undo).toContainText('Before your last import');
  await undo.getByRole('button', { name: 'Undo last import' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Undo import' }).click();
  await expect(page.locator('.undo-import')).toHaveCount(0);
  expect((await savedState(page)).players.map((p) => p.name)).toContain('After Backup');
  errs.expectNone();
});
