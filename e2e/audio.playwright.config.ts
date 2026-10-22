import { defineConfig, devices } from '@playwright/test';

/** W03: API simulada y medios locales reales; no inicia backend ni toca bases de datos. */
export default defineConfig({
  testDir: './audio-tests', testMatch: '*.spec.ts',
  fullyParallel: false, workers: 1, retries: 0, timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/audio', open: 'never' }]],
  use: { baseURL: 'http://localhost:4303', locale: 'es-ES', launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'audio-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'audio-touch', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npx ng serve --configuration e2e --port 4303 --host localhost',
    cwd: '../frontend', url: 'http://localhost:4303', reuseExistingServer: false, timeout: 120_000,
  },
});
