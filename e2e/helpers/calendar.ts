import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { ScheduleFixture } from './schedule';
export const CALENDAR_DB = 'spanishnow_w07_e2e_test';
const base = { NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: CALENDAR_DB, JWT_SECRET: 'w07-e2e-local-secret', MAIL_TRANSPORT: 'log', DOTENV_CONFIG_QUIET: 'true' };
/** Docente, alumno y compra pagada ficticios en la base aislada de W07 (misma cadena que usan las pruebas de agenda). */
export function calendarFixture(): ScheduleFixture {
  const script = `
    const db=require('./src/config/database');
    (async()=>{try{
      const {chain}=require('./tests/helpers/classSessions'); const c=await chain({size:1});
      console.log(JSON.stringify({teacher:{id:c.teacher.id,email:c.teacher.email,password:'jest-password-1'},students:c.students.map(s=>({id:s.id,email:s.email,password:'jest-password-1'})),conversationId:c.conversations[0].id,purchases:c.purchases.map(p=>p.id),cohortId:c.cohort?c.cohort.id:null,body:c.body}));
    }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8', env: { ...process.env, ...base } });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1)!);
}
