import { defineConfig, devices } from '@playwright/test';
// Reutiliza la configuración frontend schedule-e2e (:3116), con base W08 exclusiva y frontend propio :4388.
export default defineConfig({
  testDir: './zoom-tests', testMatch: 'zoom.spec.ts', globalSetup: './zoom.setup.ts',
  fullyParallel: false, workers: 1, retries: 0, timeout: 90000, expect: { timeout: 20000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4388', locale: 'es-ES', actionTimeout: 15000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'zoom-desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'zoom-mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
  webServer: { command: 'npx ng serve --configuration schedule-e2e --port 4388 --host localhost', cwd: '../frontend',
    url: 'http://localhost:4388', reuseExistingServer: false, timeout: 240000, stdout: 'ignore', stderr: 'ignore' }
});
