// Ratings record only what was observed; previous scores are hints, not data.
import { test, expect } from '@playwright/test';
import { loadDemo, savedState, trackErrors } from './helpers.js';

test('new rating starts "Not observed", shows last score as a hint, and saves only what was scored', async ({ page }) => {
  const errs = trackErrors(page);
  await loadDemo(page);
  const leo = (await savedState(page)).players.find((p) => p.name === 'Leo Martins');
  await page.goto(`/#/progress/${leo.id}`);
  await page.getByRole('button', { name: 'Rate now' }).click();
  const dialog = page.getByRole('dialog');

  // Nothing pre-selected; every skill says Not observed; last scores shown as hints.
  await expect(dialog.locator('.score-btn[aria-pressed="true"]')).toHaveCount(0);
  await expect(dialog.locator('.score-status', { hasText: 'Not observed' })).toHaveCount(6);
  await expect(dialog.locator('[data-skill="dribbling"] .score-last')).toHaveText('Last: 4');
  await expect(dialog.locator('[data-skill="shooting"] .score-last')).toHaveText('Last: 4');

  // Rubric under the scale.
  await expect(dialog.locator('.rubric dt')).toHaveText(['1', '3', '5']);

  await dialog.getByRole('button', { name: 'Shooting 5' }).click();
  await expect(dialog.locator('[data-skill="shooting"] .score-status')).toBeHidden();
  await dialog.getByRole('button', { name: 'Save rating' }).click();
  await expect(dialog).toHaveCount(0);

  const latest = (await savedState(page)).ratings.filter((r) => r.playerId === leo.id).at(-1);
  expect(latest.scores).toEqual({ shooting: 5 }); // no carried-over scores

  // Current level: shooting 4 → 5 since last, 3 → 5 since first.
  const shootingRow = page.locator('.skill-bar', { has: page.locator('.skill-name', { hasText: 'Shooting' }) });
  await expect(shootingRow.locator('.deltas .delta')).toHaveText(['+1', '+2']);
  await expect(page.locator('.skill-bar-head')).toContainText('vs last');
  errs.expectNone();
});
