import { defineConfig, devices } from '@playwright/test';

/** API completamente interceptada; no inicia backend ni consulta datos reales. */
export default defineConfig({
  testDir: './pilot-tests', outputDir: './test-results-pilot', workers: 1, retries: 0, timeout: 30000,
  expect: { timeout: 8000 }, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4412', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'compact', use: { viewport: { width: 1024, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm --prefix ../frontend start -- --configuration e2e --host 127.0.0.1 --port 4412',
    url: 'http://127.0.0.1:4412', reuseExistingServer: false, timeout: 120000,
  },
});
