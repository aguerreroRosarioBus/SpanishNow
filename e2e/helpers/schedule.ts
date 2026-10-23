import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
export interface ScheduleFixture { teacher: { id: number; email: string; password: string }; students: { id: number; email: string; password: string }[]; conversationId: number; purchases: number[]; cohortId: number | null; body: { intent: { localStart: string; timeZone: string; offset: string; minutes: number } } }
export function scheduleFixture(size = 1): ScheduleFixture {
  const script = `
    const db=require('./src/config/database');
    (async()=>{try{
      const {chain}=require('./tests/helpers/classSessions'); const c=await chain({size:Number(process.env.W06_GROUP_SIZE)});
      console.log(JSON.stringify({teacher:{id:c.teacher.id,email:c.teacher.email,password:'jest-password-1'},students:c.students.map(s=>({id:s.id,email:s.email,password:'jest-password-1'})),conversationId:c.conversations[0].id,purchases:c.purchases.map(p=>p.id),cohortId:c.cohort?.id||null,body:c.body}));
    }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'spanishnow_w06_e2e_test', JWT_SECRET: 'w06-e2e-local-secret', MAIL_TRANSPORT: 'log', W06_GROUP_SIZE: String(size), DOTENV_CONFIG_QUIET: 'true' } });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1)!);
}
export function balances(purchaseIds: number[]): { id: number; unitsAvailable: number; unitsReserved: number; unitsConsumed: number }[] {
  const run = spawnSync(process.execPath, ['-e', `const db=require('./src/config/database'); (async()=>{try{const M=require('./src/models'); console.log(JSON.stringify(await M.ClassPackagePurchase.findAll({where:{id:JSON.parse(process.env.W06_PURCHASE_IDS)},attributes:['id','unitsAvailable','unitsReserved','unitsConsumed'],order:[['id','ASC']]})));}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`], {
    cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'spanishnow_w06_e2e_test', W06_PURCHASE_IDS: JSON.stringify(purchaseIds), DOTENV_CONFIG_QUIET: 'true' }
  });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1)!);
}

// La fixture deja a todos los alumnos en Córdoba; esta prueba necesita una alumna en Londres. Se cambia solo en la base E2E aislada.
export function setStudentTimeZone(email: string, timeZone: string): void {
  const script = `
    const { User } = require('./src/models');
    (async () => {
      const [count] = await User.update({ timeZone: process.env.TZ_VALUE }, { where: { email: process.env.STUDENT_EMAIL } });
      if (count !== 1) throw new Error('No existe la alumna de la fixture');
      process.exit(0);
    })().catch(e => { console.error(e); process.exit(1); });`;
  const run = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'spanishnow_w06_e2e_test', JWT_SECRET: 'w06-e2e-local-secret', MAIL_TRANSPORT: 'log', DOTENV_CONFIG_QUIET: 'true', STUDENT_EMAIL: email, TZ_VALUE: timeZone }
  });
  if (run.status !== 0) throw new Error(`No se pudo cambiar la zona de la alumna:\n${run.stdout}\n${run.stderr}`);
}
