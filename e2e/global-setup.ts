import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as path from 'path';
import * as http from 'http';
import { BACKEND_PORT, E2E_DB, FRONTEND_PORT } from './helpers/env';

const backendDir = path.resolve(__dirname, '../backend');
let backend: ChildProcess | undefined;

function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get({ host: 'localhost', port: BACKEND_PORT, path: '/health' }, res => {
        res.resume();
        res.statusCode === 200 ? resolve() : retry();
      }).on('error', retry);
    };
    const retry = () => Date.now() > deadline ? reject(new Error('El backend E2E no respondió en /health')) : setTimeout(attempt, 300);
    attempt();
  });
}

/**
 * 1) Reconstruye spanishnow_e2e_test desde cero (migraciones + seeds curados), sin dump (--skip-dump solo vale para bases *e2e*).
 * 2) Levanta el backend en :3101 apuntando a esa base. Se hace aquí y no como webServer porque la base debe existir
 *    (y no ser borrada) antes de que el backend abra su pool de conexiones.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const rebuild = spawnSync('bash', [
    path.join(backendDir, 'scripts/db-rebuild.sh'), '--target', 'local', '--db', E2E_DB, '--yes', '--skip-dump'
  ], { encoding: 'utf8' });
  if (rebuild.status !== 0) throw new Error(`db-rebuild.sh falló:\n${rebuild.stdout}\n${rebuild.stderr}`);

  backend = spawn('node', ['src/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      DB_NAME: E2E_DB,
      DB_HOST: 'localhost',
      CORS_EXTRA_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
      // Sin Cloudinary real: las subidas se guardan en backend/uploads-dev (ver backend/docs/database.md)
      MEDIA_FAKE_UPLOADS: '1',
      MEDIA_FAKE_BASE_URL: `http://localhost:${BACKEND_PORT}`
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });
  await waitForHealth(30_000);

  return async () => { backend?.kill('SIGTERM'); };
}
