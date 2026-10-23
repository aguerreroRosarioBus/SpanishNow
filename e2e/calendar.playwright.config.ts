import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './calendar-tests', testMatch: '09-calendar.spec.ts', globalSetup: './calendar.setup.ts',
  fullyParallel: false, workers: 1, retries: 0, timeout: 120000, expect: { timeout: 20000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4317', locale: 'es-ES', actionTimeout: 15000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'calendar-desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'calendar-mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
  webServer: { command: 'npx ng serve --configuration calendar-e2e --port 4317 --host localhost', cwd: '../frontend',
    url: 'http://localhost:4317', reuseExistingServer: false, timeout: 240000, stdout: 'ignore', stderr: 'ignore' }
});
