// The unit tests also run in a real browser (tests/index.html), not just Node.
import { test, expect } from '@playwright/test';

test('unit tests pass in the browser runner', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'once is enough');
  await page.goto('/tests/index.html');
  const summary = page.locator('#summary');
  await expect(summary).toHaveText(/^\d+\/\d+ passed$/);
  const failures = await page.locator('#results li.fail').allTextContents();
  expect(failures, failures.join('\n')).toEqual([]);
  await expect(summary).toHaveClass(/pass/);
});
