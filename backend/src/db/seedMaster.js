#!/usr/bin/env node
// CLI deliberadamente separado del seed curado: no migra ni resetea la base.
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const zlib=require('zlib');
function parseArgs(argv) {
  const o={teacherEmails:[],studentEmails:[],apply:false,verify:false,audio:false};
  const values={'--env-file':'envFile','--db':'database','--confirm-db':'confirmDatabase','--assets-dir':'assetsDirectory','--assets-base':'assetsBase','--backup-dir':'backupDirectory','--voice':'voice'};
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if(['--apply','--verify','--audio'].includes(arg))o[arg.slice(2)]=true;
    else if(arg==='--teacher-email'||arg==='--student-email') {
      const value=argv[++i];if(!value||value.startsWith('--'))throw new Error(`Falta valor de ${arg}`);
      o[arg==='--teacher-email'?'teacherEmails':'studentEmails'].push(value.toLowerCase());
    } else if(values[arg]) {const value=argv[++i];if(!value||value.startsWith('--'))throw new Error(`Falta valor de ${arg}`);o[values[arg]]=value;}
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if(!o.teacherEmails.length)o.teacherEmails=['admin@gmail.com'];
  o.teacherEmails=[...new Set(o.teacherEmails)];o.studentEmails=[...new Set(o.studentEmails)];
  if(o.apply&&o.verify)throw new Error('Elegí --apply o --verify.');
  return o;
}
function assertSafe(o,env) {
  if(env.NODE_ENV==='production'||env.RAILWAY_ENVIRONMENT||env.RAILWAY_ENVIRONMENT_ID)throw new Error('Seed maestro prohibido en producción/Railway.');
  if(!['localhost','127.0.0.1','::1'].includes(env.DB_HOST||'localhost'))throw new Error('Seed maestro permitido únicamente en MySQL local.');
  if(!/^(spanishnow_main|spanishnow_master_[a-z0-9_]*test)$/.test(o.database||''))throw new Error('Indicá --db spanishnow_main o una base spanishnow_master_*test.');
  if(o.apply&&o.confirmDatabase!==o.database)throw new Error('--confirm-db debe coincidir exactamente con --db.');
}
async function backup(o,env) {
  const directory=o.backupDirectory||path.resolve(__dirname,'../../.seed-master-backups');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const name=`${o.database}-${new Date().toISOString().replace(/[:.]/g,'-')}.sql.gz`;
  const target=path.join(directory,name);
  const result=spawnSync('mysqldump',['--single-transaction','--routines','--triggers','--no-tablespaces','--set-gtid-purged=OFF','--default-character-set=utf8mb4','--host',env.DB_HOST||'localhost','--port',env.DB_PORT||'3306','--user',env.DB_USER||'root',o.database],{env:{...process.env,MYSQL_PWD:env.DB_PASSWORD||''},maxBuffer:512*1024*1024,timeout:120000});
  if(result.error||result.status!==0)throw new Error(`Respaldo fallido; no se escribe nada: ${result.error?.message||result.stderr.toString()}`);
  if(!result.stdout.includes(Buffer.from('CREATE TABLE')))throw new Error('Respaldo vacío o sin tablas; no se escribe nada.');
  const gzip=zlib.gzipSync(result.stdout);
  if(!zlib.gunzipSync(gzip).equals(result.stdout))throw new Error('El respaldo comprimido no pasó la verificación.');
  fs.writeFileSync(target,gzip,{mode:0o600,flag:'wx'});
  return target;
}
async function main(argv=process.argv.slice(2)) {
  const options=parseArgs(argv);
  require('dotenv').config({path:options.envFile||path.resolve(__dirname,'../../.env'),quiet:true});
  // La base es obligatoria y se impone antes de importar la configuración Sequelize.
  assertSafe(options,process.env);process.env.DB_NAME=options.database;
  if(!options.apply&&!options.verify) {
    console.log(`Plan sin escrituras: ${options.database}; docentes: ${options.teacherEmails.join(', ')}; alumnos existentes: ${options.studentEmails.join(', ')||'ninguno'}.`);
    console.log('24 alumnos ficticios, 5 cursos/15 unidades/45 historias por docente, evaluaciones, progreso, certificados, ventas, comunidad, paquetes, grupos y agenda.');
    console.log('Para aplicar: --apply --confirm-db <base>. Se crea un respaldo antes de escribir. --audio genera voz local de macOS.');return;
  }
  const sequelize=require('../config/database');const models=require('../models');const seed=require('../../seeds/master');
  try {
    await sequelize.authenticate();
    if(options.verify) {
      const marker=await models.AuditLog.findOne({where:{action:seed.KEY}});if(!marker)throw new Error('Esta base todavía no tiene seed maestro.');
      console.log(JSON.stringify({verified:true,counts:await seed.verify(models,marker.data)},null,2));return;
    }
    const old=await models.AuditLog.findOne({where:{action:seed.KEY}});
    if(old) {
      const result=await seed.run({models,sequelize,options});console.log(JSON.stringify({replayed:true,counts:result.counts},null,2));return;
    }
    const backupFile=await backup(options,process.env);console.log(`Respaldo verificado: ${backupFile}`);
    const assets=await require('../../seeds/master/assets').prepare({directory:options.assetsDirectory||path.resolve(__dirname,'../../../frontend/public/seed-master'),baseUrl:options.assetsBase||'/seed-master',audio:options.audio,voice:options.voice,log:console.log});
    options.password=process.env.SEED_MASTER_PASSWORD||'tprs-local-test-1';
    if(options.password.length<12)throw new Error('SEED_MASTER_PASSWORD debe tener al menos 12 caracteres.');
    const result=await seed.run({models,sequelize,options,assets,log:console.log});
    console.log(JSON.stringify({replayed:result.replayed,backup:backupFile,assets:assets.directory,counts:result.counts},null,2));
  }finally{await sequelize.close();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={parseArgs,assertSafe,backup,main};
