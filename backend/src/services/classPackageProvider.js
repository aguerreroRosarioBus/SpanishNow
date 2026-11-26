// Las ventas reales de paquetes (Hotmart) exigen una verificación auditada y vigente de cuenta, formato, garantía y mapeo,
// hecha por una persona con class_provider.verify. La aprobación es POR CUENTA de Hotmart del docente (teacherId + huella
// de su conexión), no por paquete: los paquetes vinculados después se venden sin otra revisión. Si cambia la clave o la
// conexión del docente, hace falta reaprobar. El riesgo de un enlace mal pegado se mitiga con la conciliación del webhook,
// la pausa automática del paquete ante una discrepancia (classPayments) y la auditoría de cada vínculo (classCatalog). Con PAYMENTS_FAKE=1 todo es simulado y no hace falta. La verificación
// nunca cambia PAYMENTS_FAKE ni convierte evidencia sintética en una verificación de Hotmart.
const {Op}=require('sequelize');
const {createHash}=require('node:crypto');
const sequelize=require('../config/database');
const {ClassPackageProviderVerification:Verification,User,AuditLog,TeacherHotmartConnection,TeacherClassSettings,ClassPackageTemplate}=require('../models');
const payments=require('../config/payments');
const {fail,invalid,only,validId}=require('./legalDocuments');
const PROVIDER='hotmart';
const CHECKS=['account','format','guarantee','mapping'];
const GUARANTEE_DAYS=[7,15,21,30];
const current=(options={})=>Verification.findOne({where:{provider:PROVIDER,revokedAt:null},order:[['id','DESC']],...options});
async function accountFor(verification,{teacherId,transaction}={}){
  if(!verification)return {mode:'blocked'};
  if(verification.teacherId==null)return {mode:'shared',connectionId:null};
  if(teacherId!=null&&verification.teacherId!==teacherId)return {mode:'blocked'};
  const connection=await TeacherHotmartConnection.findByPk(verification.teacherId,{transaction});
  if(!connection?.classActiveDigest||connection.classActiveDigest!==verification.connectionDigest)return {mode:'changed'};
  return {mode:'connected',connectionId:connection.publicId};
}
const mappingDigest=version=>createHash('sha256').update(JSON.stringify([
  version.hotmartProductId,version.hotmartOfferCode,version.hotmartCheckoutUrl,version.priceAmount,version.currency
])).digest('hex');
// `packageVersion` ya no condiciona la venta (la aprobación es por cuenta); se acepta por compatibilidad con quienes lo envían.
async function assertSelling({teacherId,transaction}={}){
  payments.assertSafe();
  if(payments.fake())return null;
  const verification=await current({transaction});
  const account=await accountFor(verification,{teacherId,transaction});
  if(account.mode==='blocked'||account.mode==='changed')throw fail(503,'package_provider_verification_required');
  return account.connectionId;
}
async function teacherStatus(user){
  if(user.role!=='teacher')throw fail(403,'forbidden');
  const [verification,settings]=await Promise.all([current(),TeacherClassSettings.findByPk(user.id)]);
  const account=await accountFor(verification,{teacherId:user.id});
  // Con la cuenta aprobada y conectada, todo paquete vinculado del docente queda habilitado.
  const approvedPackageIds=account.mode==='connected'?(await preparedPackages([user.id])).map(item=>item.id):null;
  return {approval:payments.fake()?'fake':account.mode,approvedPackageIds,
    classesEnabled:Boolean(settings?.classesEnabledAt),salesPaused:!settings||Boolean(settings.salesPausedAt)};
}
const person=user=>user?{id:user.id,name:user.name}:null;
const present=row=>row?{id:row.id,teacherId:row.teacherId,verifiedAt:row.verifiedAt,verifiedBy:person(row.verifiedBy),guaranteeDays:row.guaranteeDays,checks:row.checks,reason:row.reason}:null;
const revision=(connection,packages)=>createHash('sha256').update(JSON.stringify([
  connection.classActiveDigest,
  packages.map(item=>[item.id,item.currentVersion.id])
])).digest('hex');
async function preparedPackages(teacherIds,transaction){
  return ClassPackageTemplate.findAll({
    where:{teacherId:teacherIds,status:{[Op.ne]:'archived'}},attributes:['id','teacherId','status'],
    include:[{association:'currentVersion',required:true,
      where:{hotmartProductId:{[Op.ne]:null},hotmartOfferCode:{[Op.ne]:null},hotmartCheckoutUrl:{[Op.ne]:null}},
      attributes:['id','nameEs','nameEn','priceAmount','currency','createdAt','hotmartProductId','hotmartOfferCode','hotmartCheckoutUrl']}],
    order:[['id','ASC']],transaction
  });
}
async function status(){
  const verification=await current({include:[{model:User,as:'verifiedBy',attributes:['id','name']}]});
  const revoked=await Verification.findOne({where:{provider:PROVIDER,revokedAt:{[Op.ne]:null}},order:[['revokedAt','DESC'],['id','DESC']],include:[{model:User,as:'revokedBy',attributes:['id','name']}]});
  const account=await accountFor(verification);
  const connections=await TeacherHotmartConnection.findAll({
    where:{classVerifiedAt:{[Op.ne]:null},classActiveDigest:{[Op.ne]:null}},
    attributes:['teacherId','classVerifiedAt','classActiveDigest']
  });
  const byTeacher=new Map(connections.map(c=>[c.teacherId,c]));
  const teachers=await User.findAll({
    where:{id:[...byTeacher.keys()],role:'teacher',suspendedAt:null},attributes:['id','name'],order:[['name','ASC'],['id','ASC']]
  });
  const packages=await preparedPackages(teachers.map(t=>t.id));
  const candidates=teachers.map(t=>{
    const connection=byTeacher.get(t.id);
    const ready=packages.filter(item=>item.teacherId===t.id);
    const approved=verification?.teacherId===t.id&&account.mode==='connected';
    return {id:t.id,name:t.name,testedAt:connection.classVerifiedAt,revision:revision(connection,ready),
      packages:ready.map(item=>({
        id:item.id,nameEs:item.currentVersion.nameEs,nameEn:item.currentVersion.nameEn,
        priceAmount:item.currentVersion.priceAmount,currency:item.currentVersion.currency,
        productId:item.currentVersion.hotmartProductId,offerCode:item.currentVersion.hotmartOfferCode,
        url:item.currentVersion.hotmartCheckoutUrl,
        approved,
        // Versión vigente creada después de aprobar la cuenta: se vende sin revisión previa, el admin debe poder verla.
        linkedAfterApproval:approved&&new Date(item.currentVersion.createdAt)>new Date(verification.verifiedAt)
      }))};
  });
  return {mode:payments.fake()?'fake':['shared','connected'].includes(account.mode)?'verified':'blocked',account:account.mode,candidates,verification:present(verification),lastRevocation:revoked?{id:revoked.id,revokedAt:revoked.revokedAt,revokedBy:person(revoked.revokedBy),reason:revoked.revokeReason,verifiedAt:revoked.verifiedAt}:null};
}
const reasonOf=value=>typeof value==='string'&&value.trim()&&value.length<=500?value.trim():null;
async function verify(actor,body){
  if(!only(body,['checks','guaranteeDays','reason','teacherId','revision'])||!only(body.checks,CHECKS)||!CHECKS.every(k=>body.checks[k]===true))throw invalid(['checks']);
  if(body.teacherId!==undefined&&(!Number.isInteger(body.teacherId)||!validId(body.teacherId)||typeof body.revision!=='string'))throw invalid(['teacherId','revision']);
  if(body.teacherId===undefined&&body.revision!==undefined)throw invalid(['teacherId']);
  if(!GUARANTEE_DAYS.includes(body.guaranteeDays))throw invalid(['guaranteeDays']);
  const reason=reasonOf(body.reason);if(!reason)throw invalid(['reason']);
  try{
    await sequelize.transaction(async transaction=>{
      const previous=await current({transaction,lock:transaction.LOCK.UPDATE});
      if(previous&&(!body.teacherId||previous.teacherId!==body.teacherId))throw fail(409,'version_conflict');
      let connection;
      let prepared=[];
      if(body.teacherId!==undefined){
        const teacher=await User.findByPk(body.teacherId,{transaction});
        connection=await TeacherHotmartConnection.findByPk(body.teacherId,{transaction,lock:transaction.LOCK.UPDATE});
        if(teacher?.role!=='teacher'||teacher.suspendedAt||!connection?.classActiveDigest||!connection.classVerifiedAt){
          throw fail(409,'class_hotmart_test_required');
        }
        prepared=await preparedPackages([body.teacherId],transaction);
        if(!prepared.length)throw fail(409,'class_hotmart_package_required');
        if(revision(connection,prepared)!==body.revision)throw fail(409,'class_hotmart_test_required');
      }
      const digests=prepared.map(item=>mappingDigest(item.currentVersion));
      const oldDigests=previous?.mappingDigests??[];
      if(previous){
        // Misma conexión ya aprobada: no hay nada que reaprobar (los paquetes nuevos no requieren revisión).
        if(previous.connectionDigest===connection.classActiveDigest)throw fail(409,'version_conflict');
        await previous.update({revokedAt:new Date(),revokedById:actor.id,revokeReason:reason},{transaction});
        await AuditLog.create({actorId:actor.id,action:'class_provider.superseded',entityType:'class_package_provider_verifications',entityId:previous.id,reason},{transaction});
      }
      // `mappingDigests` queda solo como registro histórico de lo visto al aprobar; no condiciona las ventas.
      const account={teacherId:connection?.teacherId??null,connectionDigest:connection?.classActiveDigest??null,
        mappingDigests:connection?[...new Set([...oldDigests,...digests])]:null};
      const row=await Verification.create({provider:PROVIDER,verifiedById:actor.id,verifiedAt:new Date(),guaranteeDays:body.guaranteeDays,checks:body.checks,reason,...account},{transaction});
      await AuditLog.create({actorId:actor.id,action:'class_provider.verified',entityType:'class_package_provider_verifications',entityId:row.id,reason,data:{checks:body.checks,guaranteeDays:body.guaranteeDays,teacherId:account.teacherId,packageIds:prepared.map(item=>item.id)}},{transaction});
    });
  }catch(e){
    // La fila vigente es única. Dos altas sin fila previa también pueden disputar el lock de rango de MySQL.
    if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.parent?.code)||e.name==='SequelizeUniqueConstraintError'){
      throw fail(409,'version_conflict');
    }
    throw e;
  }
  return status();
}
async function revoke(actor,body){
  if(!only(body,['reason']))throw invalid(['reason']);
  const reason=reasonOf(body.reason);if(!reason)throw invalid(['reason']);
  await sequelize.transaction(async transaction=>{
    const row=await current({transaction,lock:transaction.LOCK.UPDATE});
    if(!row)throw fail(409,'version_conflict');
    await row.update({revokedById:actor.id,revokedAt:new Date(),revokeReason:reason},{transaction});
    await AuditLog.create({actorId:actor.id,action:'class_provider.revoked',entityType:'class_package_provider_verifications',entityId:row.id,reason,data:{verifiedAt:row.verifiedAt,guaranteeDays:row.guaranteeDays}},{transaction});
  });
  return status();
}
module.exports={assertSelling,status,teacherStatus,verify,revoke,GUARANTEE_DAYS};
