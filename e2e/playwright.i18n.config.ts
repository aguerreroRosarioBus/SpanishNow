import { defineConfig, devices } from '@playwright/test';

/** W01: solo frontend, API interceptada con cuentas ficticias; sin DB, correos ni proveedores. */
export default defineConfig({
  testDir: './tests',
  testMatch: '07-i18n.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: 'list',
  outputDir: 'test-results/i18n',
  use: {
    baseURL: 'http://localhost:4314', locale: 'es-AR',
    trace: 'retain-on-failure', screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
  ],
  webServer: {
    command: 'npx ng serve --configuration e2e --port 4314 --host localhost',
    cwd: '../frontend', url: 'http://localhost:4314', reuseExistingServer: false,
    timeout: 120_000, stdout: 'ignore', stderr: 'pipe'
  }
});
