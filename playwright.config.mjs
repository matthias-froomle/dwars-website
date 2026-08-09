import { defineConfig } from '@playwright/test';

if (process.env.DWARS_AUTH_ONLY === '1' && !process.env.DWARS_LOGIN_URL) {
  throw new Error('DWARS_AUTH_ONLY=1 requires DWARS_LOGIN_URL.');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 7_500,
  },
  outputDir: 'test-results/artifacts',
  reporter: [
    ['list'],
    ['json', {
      outputFile: process.env.DWARS_VERIFY_OUTPUT || 'test-results/results.json',
    }],
  ],
  use: {
    baseURL: process.env.DWARS_LOCAL_ORIGIN || 'http://dwars-drupal.ddev.site',
    actionTimeout: 7_500,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
