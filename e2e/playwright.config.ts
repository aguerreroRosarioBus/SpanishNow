import { defineConfig, devices } from '@playwright/test';

import { FRONTEND_PORT } from './helpers/env';

/**
 * E2E del flujo TPRS. Todo es local y aislado:
 *  - Backend en :3101 con DB_NAME=spanishnow_e2e_test (lo levanta global-setup DESPUÉS de reconstruir la base).
 *  - Frontend `ng serve --configuration e2e --port 4300` (apiUrl -> http://localhost:3101/api).
 * Los tests comparten estado en la base (flujo editar -> publicar -> consumir), por eso corren en serie, un worker.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'es-ES'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // npx ng serve evita depender de un `ng` global; se ejecuta desde frontend/.
    command: `npx ng serve --configuration e2e --port ${FRONTEND_PORT} --host localhost`,
    cwd: '../frontend',
    url: `http://localhost:${FRONTEND_PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'ignore'
  }
});
