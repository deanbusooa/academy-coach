// End-to-end tests (real browser). Run: npm run test:e2e
// Locally you can reuse an installed Chrome instead of downloading Chromium:
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
    channel,
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
  ],
  webServer: {
    command: `node tests/e2e/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
