const sequelize=require('../config/database');
const {User,Conversation,ClassPackageTemplate:Template,ClassPackageTemplateVersion:Version,ClassPolicyVersion:Policy,ClassCohort:Cohort,ClassCohortMember:Member,ClassPackagePurchase:Purchase,AuditLog}=require('../models');
const {fail,invalid,validId,only,persistedSecond}=require('./legalDocuments');
const offers=require('./classOffers');
const outbox=require('./outbox');
const chat=require('./chatService');
async function load(user,id,{transaction,lock=false}={}){
  if(!validId(id))throw fail(404,'not_found');
  const row=await Cohort.findByPk(id,{transaction,...(lock?{lock:transaction.LOCK.UPDATE}:{})});
  if(!row)throw fail(404,'not_found');
  const me=await Member.findOne({where:{cohortId:row.id,userId:user.id},transaction});
  if(row.teacherId!==user.id&&!me)throw fail(404,'not_found');
  return {row,me};
}
async function present(user,row,{transaction}={}){
  const members=await Member.findAll({where:{cohortId:row.id},order:[['userId','ASC']],transaction});
  const own=members.find(m=>m.userId===user.id);
  const teacherMembers=[];
  if(row.teacherId===user.id)for(const m of members){const u=await User.findByPk(m.userId,{attributes:['name'],transaction});const c=await Conversation.findOne({where:{teacherId:user.id,studentId:m.userId},transaction});teacherMembers.push({userId:m.userId,status:m.status,name:u?.name||'',conversationId:c?.id});}
  return {id:row.id,teacherId:row.teacherId,templateVersionId:row.templateVersionId,groupSize:row.groupSize,status:row.status,formingDeadlineAt:row.formingDeadlineAt,tentativeStartsAt:row.tentativeStartsAt,
    acceptedCount:members.filter(m=>m.status==='accepted').length,
    // La invitación no revela otras identidades, ofertas ni pagos.
    ...(row.teacherId===user.id?{members:teacherMembers}:{invitation:{status:own.status}})};
}
async function detail(user,id){const {row}=await load(user,id);return present(user,row);}
async function create(user,body){
  if(user.role!=='teacher')throw fail(403,'forbidden');
  if(!only(body,['templateVersionId','tentativeStartsAt','invitedIds'])||!Number.isInteger(body.templateVersionId)||!validId(body.templateVersionId)||!Array.isArray(body.invitedIds)||body.invitedIds.some(id=>!Number.isInteger(id)||!validId(id))||new Set(body.invitedIds).size!==body.invitedIds.length)throw invalid();
  const start=offers.instant(body.tentativeStartsAt);
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(user.id,transaction,{selling:true});
    const version=await Version.findByPk(body.templateVersionId,{transaction});
    const template=version&&await Template.findOne({where:{id:version.templateId,teacherId:user.id,status:'active'},transaction});
    if(!template)throw fail(404,'not_found');
    if(template.currentVersionId!==version.id||version.modality!=='group')throw fail(409,'version_conflict');
    if(body.invitedIds.length!==version.groupSize)throw fail(409,'group_incomplete');
    const policy=await Policy.findByPk(version.policyVersionId,{transaction});const now=persistedSecond(new Date());
    const deadline=new Date(Math.min(now.getTime()+policy.rules.groupFormingMaxHours*3600000,start.getTime()-policy.rules.groupFormingCutoffBeforeStartHours*3600000));
    if(deadline<=now)throw fail(409,'group_incomplete');
    const conversations=[];
    for(const id of [...body.invitedIds].sort((a,b)=>a-b)){
      const student=await User.findByPk(id,{transaction});
      const conversation=await Conversation.findOne({where:{teacherId:user.id,studentId:id},transaction});
      if(!student||student.role!=='student'||student.suspendedAt||!conversation)throw fail(404,'not_found');
      conversations.push(conversation);
    }
    const row=await Cohort.create({teacherId:user.id,templateVersionId:version.id,groupSize:version.groupSize,tentativeStartsAt:start,formingDeadlineAt:deadline},{transaction});
    await Member.bulkCreate(body.invitedIds.map(userId=>({cohortId:row.id,userId,invitedById:user.id})),{transaction});
    for(const c of conversations)await chat.appendSystemMessage(c.id,{eventCode:'package_group_invited',eventParams:{cohortId:row.id},dedupeKey:`cohort:${row.id}:invite:${c.studentId}`},{transaction});
    await outbox.enqueue({topic:'cohort.deadline',aggregateType:'class_cohorts',aggregateId:row.id,dedupeKey:`cohort.deadline:${row.id}`,payload:{},runAt:deadline},{transaction});
    return present(user,row,{transaction});
  });
}
async function respond(user,id,accepted){
  const ref=await load(user,id);
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.row.teacherId,transaction);
    const {row,me}=await load(user,id,{transaction,lock:true});
    if(!me)throw fail(404,'not_found');
    const status=accepted?'accepted':'declined';if(me.status===status)return present(user,row,{transaction});
    if(row.status!=='forming'||row.formingDeadlineAt<=new Date()||me.status!=='invited')throw fail(409,'group_incomplete');
    await me.update({status,respondedAt:persistedSecond(new Date())},{transaction});
    return present(user,row,{transaction});
  });
}
async function deadline(job){
  const ref=await Cohort.findByPk(job.aggregateId);if(!ref)return;
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction);
    const row=await Cohort.findByPk(ref.id,{transaction,lock:transaction.LOCK.UPDATE});
    if(row.status!=='forming'||row.formingDeadlineAt>new Date())return;
    await row.update({status:'cancelled'},{transaction});
    const purchases=await Purchase.findAll({where:{cohortId:row.id},transaction,lock:transaction.LOCK.UPDATE});
    for(const p of purchases){if(p.status!=='cancelled'){await p.update({status:'cancelled',cancelledAt:new Date(),version:p.version+1},{transaction});await AuditLog.create({action:'cohort.purchase_blocked',entityType:'class_package_purchases',entityId:p.id,reason:'group_incomplete',data:{cohortId:row.id}},{transaction});}}
    if(purchases.length)await outbox.enqueue({topic:'review.incomplete_group',aggregateType:'class_cohorts',aggregateId:row.id,dedupeKey:`review:cohort:${row.id}:incomplete`,payload:{purchaseIds:purchases.map(p=>p.id),reason:'group_incomplete'},runAt:new Date()},{transaction});
    const members=await Member.findAll({where:{cohortId:row.id},transaction});
    for(const m of members){const c=await Conversation.findOne({where:{teacherId:row.teacherId,studentId:m.userId},transaction});if(c)await chat.appendSystemMessage(c.id,{eventCode:'package_group_incomplete',eventParams:{cohortId:row.id},dedupeKey:`cohort:${row.id}:incomplete:${m.userId}`},{transaction});}
  });
}
outbox.register('cohort.deadline',deadline);
async function list(user){if(user.role!=='teacher')throw fail(403,'forbidden');const rows=await Cohort.findAll({where:{teacherId:user.id},order:[['id','DESC']],limit:200});return Promise.all(rows.map(row=>present(user,row)));}
module.exports={load,present,detail,list,create,respond,deadline};
