import { defineConfig, devices } from '@playwright/test';

/** Solo frontend y API interceptada: no inicia backend ni usa cuentas/proveedores reales. */
export default defineConfig({
  testDir: './tutorial-tests', workers: 1, fullyParallel: false, retries: 0, timeout: 30000,
  expect: { timeout: 8000 }, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4401', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm --prefix ../frontend start -- --configuration e2e --host 127.0.0.1 --port 4401',
    url: 'http://127.0.0.1:4401', reuseExistingServer: false, timeout: 120000,
  },
});
