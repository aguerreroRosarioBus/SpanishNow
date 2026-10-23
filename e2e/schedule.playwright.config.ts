import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './schedule-tests', testMatch: '08-schedule.spec.ts', globalSetup: './schedule.setup.ts',
  fullyParallel: false, workers: 1, retries: 0, timeout: 90000, expect: { timeout: 15000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4316', locale: 'es-ES', actionTimeout: 15000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'schedule-desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'schedule-mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
  webServer: { command: 'npx ng serve --configuration schedule-e2e --port 4316 --host localhost', cwd: '../frontend',
    url: 'http://localhost:4316', reuseExistingServer: false, timeout: 240000, stdout: 'ignore', stderr: 'ignore' }
});
