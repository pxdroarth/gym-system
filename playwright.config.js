const { defineConfig, devices } = require('@playwright/test');

const FRONTEND_PORT = process.env.PLAYWRIGHT_FRONTEND_PORT || '4173';
const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
const isCI = Boolean(process.env.CI);

module.exports = defineConfig({
  testDir: './tests/e2e/playwright',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/playwright-report', open: 'never' }],
  ],
  outputDir: 'tests/e2e/results',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
