import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
export interface ScheduleFixture { teacher: { id: number; email: string; password: string }; students: { id: number; email: string; password: string }[]; conversationId: number; purchases: number[]; body: { intent: { localStart: string; timeZone: string; offset: string; minutes: number } } }
export function scheduleFixture(size = 1): ScheduleFixture {
  const script = `
    const db=require('./src/config/database');
    (async()=>{try{
      const {chain}=require('./tests/helpers/classSessions'); const c=await chain({size:Number(process.env.W06_GROUP_SIZE)});
      console.log(JSON.stringify({teacher:{id:c.teacher.id,email:c.teacher.email,password:'jest-password-1'},students:c.students.map(s=>({id:s.id,email:s.email,password:'jest-password-1'})),conversationId:c.conversations[0].id,purchases:c.purchases.map(p=>p.id),body:c.body}));
    }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'spanishnow_w06_e2e_test', JWT_SECRET: 'w06-e2e-local-secret', MAIL_TRANSPORT: 'log', W06_GROUP_SIZE: String(size), DOTENV_CONFIG_QUIET: 'true' } });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1)!);
}
