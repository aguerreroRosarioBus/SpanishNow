import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
const backendDir = path.resolve(__dirname, '../backend');
export const SCHEDULE_DB = 'spanishnow_w06_e2e_test';
export default async function setup() {
  const script = `
    const mysql = require('mysql2/promise');
    (async () => {
      if (process.env.DB_NAME !== 'spanishnow_w06_e2e_test' || process.env.DB_HOST !== '127.0.0.1') throw new Error('Base E2E no autorizada');
      const admin = await mysql.createConnection({host:'127.0.0.1',user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||''});
      try { await admin.query('DROP DATABASE IF EXISTS spanishnow_w06_e2e_test'); await admin.query('CREATE DATABASE spanishnow_w06_e2e_test'); } finally { await admin.end(); }
      const db = require('./src/config/database');
      try { const {createMigrator}=require('./src/db/migrator'); const migrator=await createMigrator(db,{logger:{info(){},warn(){},error(){},debug(){}}}); await migrator.umzug.up(); } finally { await db.close(); }
    })().catch(e => {console.error(e);process.exitCode=1;});`;
  const env = { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: SCHEDULE_DB, JWT_SECRET: 'w06-e2e-local-secret',
    MAIL_TRANSPORT: 'log', FEATURE_CHAT: '1', FEATURE_CLASS_SCHEDULING: '1', CHAT_UNREAD_EMAIL: '0',
    INTEGRATIONS_FAKE: '1', OUTBOX_WORKER: '0', DOTENV_CONFIG_QUIET: 'true', TZ: 'Asia/Tokyo' };
  const result = spawnSync(process.execPath, ['-e', script], { cwd: backendDir, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  const server = spawn(process.execPath, ['src/server.js'], { cwd: backendDir, env: { ...env, PORT: '3116', CORS_EXTRA_ORIGINS: 'http://localhost:4316' }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    const deadline = Date.now() + 30000;
    for (;;) {
      try { if ((await fetch('http://localhost:3116/health')).ok) break; } catch { /* arranque local */ }
      if (Date.now() > deadline) throw new Error('Backend W06 no responde');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } catch (error) { server.kill('SIGTERM'); throw error; }
  return async () => { server.kill('SIGTERM'); };
}
