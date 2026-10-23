// Solicitud, decisión interna y devolución del proveedor son hechos distintos, todos auditables.
const {createHash}=require('crypto');
const sequelize=require('../config/database');
const {ClassPackagePurchase:Purchase,ClassPackageOrder:Order,AuditLog}=require('../models');
const {fail,invalid,only,validId}=require('./legalDocuments');
const purchases=require('./classPurchases');
const offers=require('./classOffers');
const outbox=require('./outbox');
const TYPES=['voluntary','service_unavailable','group_incomplete','other'];
const reason=value=>typeof value==='string'&&Boolean(value.trim())&&value.length<=500;
const entityType='class_package_purchases';
async function history(p,transaction){return AuditLog.findAll({where:{entityType,entityId:p.id,action:['refund.requested','refund.reviewed','refund.deadline_verified']},order:[['id','ASC']],transaction});}
function requests(rows,order){return rows.filter(a=>a.action==='refund.requested').map(a=>{
  const decisions=rows.filter(b=>b.action==='refund.reviewed'&&b.data.requestId===Number(a.id));
  return {id:Number(a.id),reason:a.reason,createdAt:a.createdAt,type:a.data.type,classification:a.data.classification,amount:a.data.amount,currency:a.data.currency,
    status:order.status==='refunded'?'confirmed':decisions.at(-1)?.data.status||'requested',updates:decisions.map(d=>({reason:d.reason,status:d.data.status,createdAt:d.createdAt}))};
});}
async function preview(p,{transaction,now=new Date(),type='voluntary'}={}){
  const order=await Order.findByPk(p.orderId,{transaction});const rows=await history(p,transaction);
  const calculated=new Date(p.paidAt.getTime()+p.snapshot.policy.refundWindowHours*3600000);
  const verified=rows.filter(a=>a.action==='refund.deadline_verified').map(a=>new Date(a.data.deadline)).sort((a,b)=>b-a)[0];
  const deadline=new Date(Math.max(calculated.getTime(),verified?.getTime()||0));
  const requestedAt=rows.find(a=>a.action==='refund.requested'&&a.data.type===type)?.createdAt||now;
  const classification=p.snapshot.policy.refundMode==='full_unused_then_review'&&type==='voluntary'&&p.unitsConsumed===0&&requestedAt<=deadline?'standard_full_unused':'individual_review';
  const reservationsPending=await purchases.unresolved(p,transaction,now);
  const result={purchaseId:p.id,orderId:order.id,provider:order.provider,version:p.version,amount:order.amount,currency:order.currency,orderStatus:order.status,refundedAmount:order.refundedAmount,
    deadline:deadline.toISOString(),deadlineVerified:Boolean(verified&&verified>=calculated),classification,reservationsPending,consumed:p.unitsConsumed,available:p.unitsAvailable,reserved:p.unitsReserved,type};
  return {...result,quote:createHash('sha256').update(JSON.stringify(result)).digest('hex'),requests:requests(rows,order)};
}
async function ownPreview(user,id,type){if(type!==undefined&&!TYPES.includes(type))throw invalid(['type']);const p=await purchases.load(user,id);if(p.buyerId!==user.id)throw fail(404,'not_found');return preview(p,{type});}
async function request(user,id,body,key){
  offers.key(key);
  if(!only(body,['version','reason','type','quote'])||!reason(body.reason)||!TYPES.includes(body.type)||typeof body.quote!=='string'||!Number.isSafeInteger(body.version))throw invalid();
  const ref=await purchases.load(user,id);if(ref.buyerId!==user.id)throw fail(404,'not_found');
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction);const p=await purchases.load(user,id,{transaction,lock:true});
    const rows=await history(p,transaction);const previous=rows.find(a=>a.action==='refund.requested'&&a.actorId===user.id&&a.data.key===key);
    if(previous){if(previous.reason!==body.reason.trim()||previous.data.type!==body.type||previous.data.quote!==body.quote)throw fail(409,'operation_key_conflict');return preview(p,{transaction,type:body.type});}
    const view=await preview(p,{transaction,type:body.type});
    if(view.version!==body.version||view.quote!==body.quote)throw fail(409,'version_conflict');
    if(view.orderStatus==='refunded')throw fail(409,'refund_already_confirmed');
    if(view.requests.length)throw fail(409,'refund_request_exists');
    await AuditLog.create({actorId:user.id,action:'refund.requested',entityType,entityId:p.id,reason:body.reason.trim(),data:{key,type:body.type,quote:body.quote,classification:view.classification,amount:view.amount,currency:view.currency,deadline:view.deadline,deadlineVerified:view.deadlineVerified,version:p.version}},{transaction});
    await outbox.enqueue({topic:'review.package_refund',aggregateType:entityType,aggregateId:p.id,dedupeKey:`review.package_refund:${p.id}`,payload:{purchaseId:p.id},runAt:new Date()},{transaction});
    return preview(p,{transaction,type:body.type});
  });
}
async function adminList(){
  const refs=await AuditLog.findAll({where:{action:'refund.requested',entityType},order:[['id','DESC']],limit:200});const items=[];
  for(const ref of refs){const p=await Purchase.findByPk(ref.entityId);if(p)items.push({...await preview(p,{type:ref.data.type}),buyerId:p.buyerId,teacherId:p.teacherId});}return items;
}
async function review(actor,id,body){
  if(!validId(id)||!only(body,['action','reason','quote'])||!['approve','manual_update','needs_information'].includes(body.action)||!reason(body.reason)||typeof body.quote!=='string')throw invalid();
  const request=await AuditLog.findOne({where:{id,action:'refund.requested',entityType}});if(!request)throw fail(404,'not_found');
  const ref=await Purchase.findByPk(request.entityId);
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction);const p=await Purchase.findByPk(ref.id,{transaction,lock:transaction.LOCK.UPDATE});
    const view=await preview(p,{transaction,type:request.data.type});
    if(view.quote!==body.quote)throw fail(409,'version_conflict');
    const latest=view.requests.find(r=>r.id===Number(id));
    if(latest.status==='confirmed')return view;
    let status=['queued','manual_hotmart'].includes(latest.status)?latest.status:(body.action==='needs_information'?'needs_information':'manual_followup');
    if(body.action==='approve'){
      if(view.reservationsPending)throw fail(409,'sessions_pending_resolution');
      if(!['paid','paid_needs_review'].includes(view.orderStatus))throw fail(409,'payment_review_required');
      if(['queued','manual_hotmart'].includes(latest.status))return view;
      const order=await Order.findByPk(p.orderId,{transaction});
      status=order.provider==='fake'?'queued':'manual_hotmart';
      // Impedir nuevas reservas durante el trámite; todavía no hay dinero ni créditos reembolsados.
      if(p.status!=='cancelled')await p.update({status:'cancelled',cancelledAt:new Date(),version:p.version+1},{transaction});
      if(order.provider==='fake')await outbox.enqueue({topic:'payment.refund',aggregateType:'class_package_orders',aggregateId:p.orderId,dedupeKey:`payment.refund:${p.orderId}`,payload:{reason:body.reason.trim()},runAt:new Date()},{transaction});
    }
    await AuditLog.create({actorId:actor.id,action:'refund.reviewed',entityType,entityId:p.id,reason:body.reason.trim(),data:{requestId:Number(id),status,amount:view.amount,currency:view.currency,classification:view.classification}},{transaction});
    return preview(p,{transaction,type:request.data.type});
  });
}
async function verifyDeadline(actor,id,body){
  if(!validId(id)||!only(body,['deadline','reason'])||!reason(body.reason))throw invalid();
  const deadline=offers.instant(body.deadline);const ref=await Purchase.findByPk(id);if(!ref)throw fail(404,'not_found');
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction);const p=await Purchase.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});const view=await preview(p,{transaction});
    if(deadline<new Date(view.deadline))throw invalid(['deadline']);
    await AuditLog.create({actorId:actor.id,action:'refund.deadline_verified',entityType,entityId:p.id,reason:body.reason.trim(),data:{deadline:deadline.toISOString()}},{transaction});return preview(p,{transaction});
  });
}
module.exports={preview,ownPreview,request,adminList,review,verifyDeadline};
