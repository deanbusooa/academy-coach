import { expect } from '@playwright/test';

/** Collect uncaught page errors and console errors; assert none at the end of a test. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return {
    errors,
    expectNone: () => expect(errors, errors.join('\n')).toEqual([]),
  };
}

/** Open the app on a clean profile and load the demo squad. */
export async function loadDemo(page) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page).toHaveURL(/#\/players$/);
  await expect(page.locator('.list .title').first()).toBeVisible();
}

export const STORAGE_KEY = 'academyCoach.v1';

/** Read the persisted app state from localStorage. */
export function savedState(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY);
}

/** ISO date n days from today (local), as the app computes it. */
export function isoDaysFromToday(page, n) {
  return page.evaluate((days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, n);
}
