import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
function run(script: string, params = {}) {
  const result = spawnSync(process.execPath, ['-e', `const db=require('./src/config/database'); (async()=>{try{${script}}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});`], {
    cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'spanishnow_w08_e2e_test',
      JWT_SECRET: 'w08-e2e-local-secret', MAIL_TRANSPORT: 'log', DOTENV_CONFIG_QUIET: 'true', ZOOM_E2E_PARAMS: JSON.stringify(params) }
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!);
}
export function zoomFixture() {
  return run(`const M=require('./src/models');const {chain,uuid}=require('./tests/helpers/classSessions');const c=await chain();
    const board=await M.LiveClass.create({teacherId:c.teacher.id,title:'Pizarra ficticia',joinCode:uuid().slice(0,16),board:{}});
    const api=require('./src/services/classSessionService');const created=await api.create(c.teacher,{...c.body,liveClassId:board.id},uuid());
    const session=await api.accept(c.students[0],created.session.id,1);
    console.log(JSON.stringify({teacher:{id:c.teacher.id,email:c.teacher.email,password:'jest-password-1',token:c.teacher.token},student:{id:c.students[0].id,email:c.students[0].email,password:'jest-password-1',token:c.students[0].token},sessionId:session.id,purchaseId:c.purchases[0].id,intent:c.body.intent}));`);
}
export function zoomState(sessionId: number) {
  return run(`const M=require('./src/models');const p=JSON.parse(process.env.ZOOM_E2E_PARAMS);
    const session=await M.ClassSession.findByPk(p.sessionId);const ref=await M.ExternalSyncRef.findOne({where:{sessionId:p.sessionId,provider:'zoom'}});
    console.log(JSON.stringify({status:ref?.status,externalId:ref?.externalId,syncedVersion:ref?.syncedVersion,joinUrl:ref?.joinUrl,startsAt:session.startsAt,version:session.version,sessionStatus:session.status}));`, { sessionId });
}

export function zoomConnectionState(userId: number) {
  return run(`const c=await require('./src/models').ExternalConnection.findOne({where:{userId:JSON.parse(process.env.ZOOM_E2E_PARAMS).userId,provider:'zoom'}});
    console.log(JSON.stringify({status:c?.status||'disconnected',credentials:Boolean(c?.credentials),pending:Boolean(c?.oauthVerifier)}));`, { userId });
}
