const fs=require('fs');
const path=require('path');
const os=require('os');
const {Op}=require('sequelize');
const {parseArgs,assertSafe}=require('../src/db/seedMaster');
const {validateGraph}=require('../seeds/master/verify');
const {prepare}=require('../seeds/master/assets');
const {run,verify,KEY}=require('../seeds/master');
const originalDatabase=process.env.DB_NAME;
const SCRATCH_DB='spanishnow_master_jest_test_seed';
process.env.DB_NAME=SCRATCH_DB;
const M=require('../src/models');
const sequelize=require('../src/config/database');
process.env.DB_NAME=originalDatabase;
const {createScratchDb,dropScratchDb}=require('./helpers/scratchDb');
const {createMigrator}=require('../src/db/migrator');
const {completionOf}=require('../src/services/certificateService');
const {restoreBoard}=require('../src/services/liveBoard');

describe('guardas del seed maestro',()=>{
  test('plan por defecto, opciones completas y argumentos erróneos',()=>{
    expect(parseArgs(['--db','spanishnow_main']).apply).toBe(false);
    expect(parseArgs(['--teacher-email','T@EXAMPLE.TEST','--teacher-email','t@example.test']).teacherEmails).toEqual(['t@example.test']);
    expect(()=>parseArgs(['--teacher-email'])).toThrow('Falta valor');
    expect(()=>parseArgs(['--apply','--verify'])).toThrow('Elegí');
    expect(()=>parseArgs(['--force'])).toThrow('desconocido');
  });
  test('solo local, fuera de producción, base explícita y confirmación exacta',()=>{
    const o={database:'spanishnow_main',apply:true,confirmDatabase:'spanishnow_main'};
    expect(()=>assertSafe(o,{DB_HOST:'127.0.0.1'})).not.toThrow();
    for(const env of [{NODE_ENV:'production'},{RAILWAY_ENVIRONMENT:'staging'},{DB_HOST:'remote.test'}])expect(()=>assertSafe(o,env)).toThrow();
    expect(()=>assertSafe({...o,database:'spanishnow'},{})).toThrow();
    expect(()=>assertSafe({...o,confirmDatabase:'otra'},{})).toThrow();
  });
  test('la auditoría rechaza una compra cuyo ledger no coincide',()=>{
    const errors=validateGraph({ClassPackagePurchase:[{id:1,offerId:1,orderId:1,unitsGranted:4,unitsAvailable:3,unitsReserved:0,unitsConsumed:0,unitsExpired:0,unitsRefunded:0}]});
    expect(errors.some(e=>e.includes('ledger y saldo'))).toBe(true);
  });
});

describe('seed maestro persistido',()=>{
  let teacher,recentTeacher,existingStudent,existingConversation,assets,directory,result;
  const options={teacherEmails:[],studentEmails:[],password:'master-test-password',now:new Date()};
  beforeAll(async()=>{
    const scratch=await createScratchDb(SCRATCH_DB);
    const migrator=await createMigrator(scratch,{logger:{info(){},warn(){},error(){},debug(){}}});
    await migrator.umzug.up();await scratch.close();
    const marker=await M.AuditLog.findOne({where:{action:KEY}});if(marker)throw new Error('La base de Jest contiene un seed maestro ajeno');
    teacher=await M.User.create({name:'Docente maestro',email:`master-teacher-${Date.now()}@example.test`,password:'master-test-password',role:'teacher',createdAt:new Date(Date.now()-250*86400000)});
    recentTeacher=await M.User.create({name:'Docente reciente',email:`master-recent-${Date.now()}@example.test`,password:'master-test-password',role:'teacher',createdAt:new Date(Date.now()-2*86400000)});
    existingStudent=await M.User.create({name:'Alumno previo',email:`master-existing-${Date.now()}@example.test`,password:'existing-test-password',role:'student',createdAt:new Date(Date.now()-150*86400000)});
    existingConversation=await M.Conversation.create({teacherId:teacher.id,studentId:existingStudent.id,lastMessageSeq:1,lastMessageAt:new Date(Date.now()-86400000),createdAt:new Date(Date.now()-86400000)});
    await M.ConversationParticipant.bulkCreate([{conversationId:existingConversation.id,userId:teacher.id,role:'teacher'}, {conversationId:existingConversation.id,userId:existingStudent.id,role:'student'}]);
    await M.Message.create({conversationId:existingConversation.id,senderId:existingStudent.id,seq:1,type:'text',body:'Mensaje previo que se conserva.',createdAt:existingConversation.lastMessageAt});
    options.teacherEmails=[teacher.email,recentTeacher.email]; options.studentEmails=[existingStudent.email];
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'spanishnow-master-assets-'));
    assets=await prepare({directory});
  });
  afterAll(async()=>{
    if(directory)fs.rmSync(directory,{recursive:true,force:true});
    await dropScratchDb(SCRATCH_DB,sequelize);
  });
  test('un fallo previo a verificar revierte todo el dataset',async()=>{
    const users=await M.User.count(),courses=await M.Course.count();
    await expect(run({models:M,sequelize,options:{...options,failBeforeVerify:true},assets})).rejects.toThrow('Fallo inyectado');
    expect(await M.User.count()).toBe(users);expect(await M.Course.count()).toBe(courses);
    expect(await M.AuditLog.count({where:{action:KEY}})).toBe(0);
  },120000);
  test('primera carga, reglas reales de certificados, pizarras y documentos',async()=>{
    result=await run({models:M,sequelize,options,assets});
    expect(result.replayed).toBe(false);expect(result.counts.Course).toBe(10);expect(result.counts.Story).toBe(90);
    expect(result.counts.UnitQuiz).toBe(30);expect(result.counts.LessonAnswer).toBeGreaterThan(500);
    expect(result.counts.ClassSession).toBeGreaterThan(30);
    const certificates=await M.Certificate.findAll({where:{id:{[Op.in]:result.manifest.rows.Certificate}}});
    for(const cert of certificates)expect((await completionOf(await M.Enrollment.findByPk(cert.enrollmentId))).eligible).toBe(true);
    const boards=await M.LiveClass.findAll({where:{id:{[Op.in]:result.manifest.rows.LiveClass}}});
    for(const live of boards)expect(()=>restoreBoard({format:'spanishnow-live-board',version:1,board:live.board},teacher.id)).not.toThrow();
    expect((await M.Message.findOne({where:{conversationId:existingConversation.id,seq:1}})).body).toBe('Mensaje previo que se conserva.');
    expect(await existingStudent.comparePassword('existing-test-password')).toBe(true);
    expect(await M.OutboxJob.count()).toBe(0);
    for(const file of assets.files.filter(f=>f.endsWith('.pdf')))expect(fs.readFileSync(path.join(directory,file)).subarray(0,5).toString()).toBe('%PDF-');
  },120000);
  test('repetir no cambia filas, contraseñas, fechas, progreso ni identidad del dataset',async()=>{
    const before=await M.User.findOne({where:{id:result.manifest.studentIds[0]},raw:true});
    const second=await run({models:M,sequelize,options:{...options,password:'otra-password',now:new Date(Date.now()+86400000)},assets});
    expect(second.replayed).toBe(true);expect(second.counts).toEqual(result.counts);
    expect(await M.User.findByPk(before.id,{raw:true})).toEqual(before);
    expect(await M.AuditLog.count({where:{action:KEY}})).toBe(1);
    await expect(run({models:M,sequelize,options:{...options,teacherEmails:['otra@example.test']},assets})).rejects.toThrow('otro alcance');
  },120000);
  test('corrupción del certificado se detecta desde la base',async()=>{
    const cert=await M.Certificate.findByPk(result.manifest.rows.Certificate[0]);
    const p=await M.LessonProgress.findOne({where:{enrollmentId:cert.enrollmentId}});
    await p.update({narrativeCompleted:false});
    await expect(verify(M,result.manifest)).rejects.toThrow('historias pendientes');
    await p.update({narrativeCompleted:true});
    expect(await verify(M,result.manifest)).toEqual(result.counts);
  },120000);
});
