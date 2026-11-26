// Regression: keyboard-only use of the register and modals.
import { test, expect } from '@playwright/test';
import { trackErrors, loadDemo } from './helpers.js';

// The two Tab-driven tests run on desktop Chromium only. The dialog stacking
// and reduced-motion tests aren't keyboard-specific, so they run everywhere.
const desktopKeyboardOnly = (testInfo) =>
  test.skip(testInfo.project.name !== 'desktop', "keyboard Tab order: desktop only (WebKit/Safari doesn't Tab to buttons by default)");

const activeKey = (page) => page.evaluate(() => document.activeElement?.dataset?.focusKey ?? document.activeElement?.tagName ?? null);

/** Press Tab (or Shift+Tab) until the focused element's data-focus-key matches. */
async function tabTo(page, matcher, { back = false, max = 80 } = {}) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const key = await activeKey(page);
    if (typeof matcher === 'string' ? key === matcher : matcher.test(key ?? '')) return key;
  }
  throw new Error(`Could not Tab to ${matcher}`);
}

async function openUpcomingSession(page) {
  await loadDemo(page);
  await page.goto('/#/sessions');
  await page.getByRole('link', { name: /Passing & receiving/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Passing & receiving' })).toBeVisible();
}

test('register can be taken with the keyboard; focus stays on the tile', async ({ page }, testInfo) => {
  desktopKeyboardOnly(testInfo);
  const errs = trackErrors(page);
  await openUpcomingSession(page);

  const first = await tabTo(page, /^att-/);
  const firstTile = page.locator(`[data-focus-key="${first}"]`);

  await page.keyboard.press('Enter');
  await expect(firstTile).toContainText('Present');
  expect(await activeKey(page)).toBe(first);

  // The ring is visible on the re-rendered tile.
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline).not.toBe('none');

  await page.keyboard.press('Space');
  await expect(firstTile).toContainText('Late');
  await page.keyboard.press('Enter');
  await expect(firstTile).toContainText('Absent');
  await page.keyboard.press('Enter');
  await expect(firstTile).toContainText('—');
  expect(await activeKey(page)).toBe(first);

  // Next tile.
  await page.keyboard.press('Tab');
  const second = await activeKey(page);
  expect(second).toMatch(/^att-/);
  expect(second).not.toBe(first);
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-focus-key="${second}"]`)).toContainText('Present');
  expect(await activeKey(page)).toBe(second);

  // "All present" keeps focus too.
  await tabTo(page, 'all-present', { back: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('.att-tile:not(.is-present)')).toHaveCount(0);
  expect(await activeKey(page)).toBe('all-present');

  errs.expectNone();
});

test('modal makes the page inert, traps Tab, and Escape returns focus', async ({ page }, testInfo) => {
  desktopKeyboardOnly(testInfo);
  await openUpcomingSession(page);
  await tabTo(page, 'edit');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.app')).toHaveJSProperty('inert', true);
  await expect(page.locator('#toast-root')).toHaveJSProperty('inert', false);

  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))
      || document.activeElement === document.body);
    expect(inside, `Tab ${i + 1} left the dialog`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.app')).toHaveJSProperty('inert', false);
  expect(await activeKey(page)).toBe('edit');
});

test('stacked dialogs: only the top one is interactive', async ({ page }) => {
  await openUpcomingSession(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  const backdrops = page.locator('.modal-backdrop');
  await expect(backdrops).toHaveCount(2);
  await expect(backdrops.nth(0)).toHaveJSProperty('inert', true);
  await expect(backdrops.nth(1)).toHaveJSProperty('inert', false);
  await page.keyboard.press('Escape'); // closes the confirm only
  await expect(backdrops).toHaveCount(1);
  await expect(backdrops.nth(0)).toHaveJSProperty('inert', false);
});

test('prefers-reduced-motion disables the sheet animation', async ({ page }) => {
  await openUpcomingSession(page);
  const duration = async () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.modal')).animationDuration));

  await page.getByRole('button', { name: 'Edit' }).click();
  expect(await duration()).toBeGreaterThan(0.05);
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Edit' }).click();
  expect(await duration()).toBeLessThan(0.001);
});
