// End-to-end tests (real browser). Run: npm run test:e2e
// Projects: phone (Pixel 7, Chromium), desktop (Chromium), iphone (iPhone 14, WebKit).
// Locally you can reuse an installed Chrome for the Chromium projects:
//   PW_CHANNEL=chrome npm run test:e2e
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // The SW would serve cached files between runs; tests that need it opt in.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // `channel` (e.g. local Chrome) only applies to the Chromium projects.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    // Safari engine on an iPhone layout: most coaches using a home-screen app are on iOS.
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: `node tests/e2e/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
