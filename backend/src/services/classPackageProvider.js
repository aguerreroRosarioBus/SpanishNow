// Las ventas reales de paquetes (Hotmart) exigen una verificación auditada y vigente de cuenta, formato, garantía y mapeo,
// hecha por una persona con class_provider.verify. Con PAYMENTS_FAKE=1 todo es simulado y no hace falta. La verificación
// nunca cambia PAYMENTS_FAKE ni convierte evidencia sintética en una verificación de Hotmart.
const {Op}=require('sequelize');
const sequelize=require('../config/database');
const {ClassPackageProviderVerification:Verification,User,AuditLog}=require('../models');
const payments=require('../config/payments');
const {fail,invalid,only}=require('./legalDocuments');
const PROVIDER='hotmart';
const CHECKS=['account','format','guarantee','mapping'];
const GUARANTEE_DAYS=[7,15,21,30];
const current=(options={})=>Verification.findOne({where:{provider:PROVIDER,revokedAt:null},order:[['id','DESC']],...options});
async function assertSelling({transaction}={}){
  payments.assertSafe();
  if(payments.fake())return;
  if(!await current({transaction,attributes:['id']}))throw fail(503,'package_provider_verification_required');
}
const person=user=>user?{id:user.id,name:user.name}:null;
const present=row=>row?{id:row.id,verifiedAt:row.verifiedAt,verifiedBy:person(row.verifiedBy),guaranteeDays:row.guaranteeDays,checks:row.checks,reason:row.reason}:null;
async function status(){
  const verification=await current({include:[{model:User,as:'verifiedBy',attributes:['id','name']}]});
  const revoked=await Verification.findOne({where:{provider:PROVIDER,revokedAt:{[Op.ne]:null}},order:[['revokedAt','DESC'],['id','DESC']],include:[{model:User,as:'revokedBy',attributes:['id','name']}]});
  return {mode:payments.fake()?'fake':verification?'verified':'blocked',verification:present(verification),lastRevocation:revoked?{id:revoked.id,revokedAt:revoked.revokedAt,revokedBy:person(revoked.revokedBy),reason:revoked.revokeReason,verifiedAt:revoked.verifiedAt}:null};
}
const reasonOf=value=>typeof value==='string'&&value.trim()&&value.length<=500?value.trim():null;
async function verify(actor,body){
  if(!only(body,['checks','guaranteeDays','reason'])||!only(body.checks,CHECKS)||!CHECKS.every(k=>body.checks[k]===true))throw invalid(['checks']);
  if(!GUARANTEE_DAYS.includes(body.guaranteeDays))throw invalid(['guaranteeDays']);
  const reason=reasonOf(body.reason);if(!reason)throw invalid(['reason']);
  try{
    await sequelize.transaction(async transaction=>{
      if(await current({transaction,lock:transaction.LOCK.UPDATE}))throw fail(409,'version_conflict');
      const row=await Verification.create({provider:PROVIDER,verifiedById:actor.id,verifiedAt:new Date(),guaranteeDays:body.guaranteeDays,checks:body.checks,reason},{transaction});
      await AuditLog.create({actorId:actor.id,action:'class_provider.verified',entityType:'class_package_provider_verifications',entityId:row.id,reason,data:{checks:body.checks,guaranteeDays:body.guaranteeDays}},{transaction});
    });
  }catch(e){
    // Dos verificaciones simultáneas: el índice único de activeProvider deja pasar solo una.
    if(e.parent?.code==='ER_DUP_ENTRY'||e.name==='SequelizeUniqueConstraintError')throw fail(409,'version_conflict');throw e;
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
module.exports={assertSelling,status,verify,revoke,GUARANTEE_DAYS};
