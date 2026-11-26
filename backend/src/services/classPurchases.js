const {Op}=require('sequelize');
const sequelize=require('../config/database');
const {ClassPackagePurchase:Purchase,ClassPackageBeneficiary:Beneficiary,ClassCreditLedger:Ledger,ClassSession:Session,ClassSessionParticipant:Participant,ClassSessionProposal:Proposal,ClassOffer:Offer,ClassPackageOrder:Order,AuditLog,User}=require('../models');
const {fail,invalid,only,validId,persistedSecond}=require('./legalDocuments');
const credits=require('./classCredits');
const offers=require('./classOffers');
const outbox=require('./outbox');
const chat=require('./chatService');
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
// Tope de un ajuste manual (D3-DIN-01): un error de tecleo no debe dejar cientos de clases pagadas ni desbordar el saldo.
const MAX_ADJUST_UNITS=50;
async function load(user,id,{transaction,lock=false,teacher=false}={}){
  if(!validId(id))throw fail(404,'not_found');const p=await Purchase.findByPk(id,{transaction,...(lock?{lock:transaction.LOCK.UPDATE}:{})});
  if(!p)throw fail(404,'not_found');
  const visible=teacher?user.role==='teacher'&&p.teacherId===user.id:p.buyerId===user.id||Boolean(await Beneficiary.findOne({where:{purchaseId:p.id,userId:user.id},transaction}));
  if(!visible)throw fail(404,'not_found');return p;
}
const present=p=>{const {hotmartCheckoutUrl,...snapshot}=p.snapshot;return {...p.toJSON(),snapshot,balance:{granted:p.unitsGranted,available:p.unitsAvailable,reserved:p.unitsReserved,consumed:p.unitsConsumed,expired:p.unitsExpired,refunded:p.unitsRefunded}};};
// Datos de lectura para las tarjetas: saldo ajustado a mano (D3-DIN-09) y estado del reembolso (D3-DIN-04). Nunca incluye el motivo interno.
async function decorate(views){
  if(!views.length)return views;
  const ids=views.map(v=>Number(v.id));
  const moves=await Ledger.findAll({where:{purchaseId:ids,operation:'adjust'},attributes:['purchaseId','units','fromBucket','toBucket']});
  const logs=await AuditLog.findAll({where:{entityType:'class_package_purchases',entityId:ids,action:['refund.requested','refund.reviewed']},order:[['id','ASC']],attributes:['id','action','entityId','data']});
  const orders=new Map((await Order.findAll({where:{id:[...new Set(views.map(v=>v.orderId))]},attributes:['id','status','amount','currency','refundedAmount']})).map(o=>[Number(o.id),o]));
  return views.map(v=>{
    const adjustedUnits=moves.filter(m=>Number(m.purchaseId)===Number(v.id)).reduce((n,m)=>n+(m.fromBucket==='none'?m.units:m.toBucket==='none'?-m.units:0),0);
    const mine=logs.filter(a=>Number(a.entityId)===Number(v.id));const request=mine.filter(a=>a.action==='refund.requested').at(-1);
    const order=orders.get(Number(v.orderId));
    const decided=request&&mine.filter(a=>a.action==='refund.reviewed'&&Number(a.data.requestId)===Number(request.id)).at(-1);
    const refund=request?{status:order?.status==='refunded'?'confirmed':decided?.data.status||'requested',amount:request.data.amount,currency:request.data.currency,refundedAmount:order?.refundedAmount??0}:null;
    return {...v,adjustedUnits,refund,paid:order?{amount:order.amount,currency:order.currency}:null};
  });
}
async function scheduleExpiry(p,transaction){await outbox.enqueue({topic:'purchase.expire',aggregateType:'class_package_purchases',aggregateId:p.id,dedupeKey:`purchase.expire:${p.id}:v${p.version}`,payload:{},runAt:p.expiresAt},{transaction});}
async function event(p,code,transaction){const offer=await Offer.findByPk(p.offerId,{transaction});await chat.appendSystemMessage(offer.conversationId,{eventCode:code,offerId:offer.id,eventParams:{purchaseId:p.id},dedupeKey:`purchase:${p.id}:v${p.version}:${code}`},{transaction});}
async function resumeLocked(p,transaction,now){
  const remainingHours=Math.max(0,p.snapshot.policy.maxPauseHours-p.pausedHoursUsed);
  const elapsed=Math.max(0,Math.min(now-p.pausedAt,remainingHours*3600000));
  await p.update({status:'active',expiresAt:new Date(p.expiresAt.getTime()+elapsed),pausedAt:null,pausedHoursUsed:p.pausedHoursUsed+Math.ceil(elapsed/3600000),version:p.version+1},{transaction});
  await scheduleExpiry(p,transaction);await event(p,'package_resumed',transaction);
}
async function settleLocked(p,transaction,now){
  if(p.status==='paused'){
    const remainingHours=Math.max(0,p.snapshot.policy.maxPauseHours-p.pausedHoursUsed);
    if(now-p.pausedAt>=remainingHours*3600000)await resumeLocked(p,transaction,now);
  }
  if(['active','exhausted'].includes(p.status)&&p.expiresAt<=now){
    if(p.unitsAvailable)await credits.apply({purchaseId:p.id,operation:'expire',units:p.unitsAvailable,operationKey:`expire:purchase:${p.id}`},{transaction});
    await p.reload({transaction});await p.update({status:'expired',version:p.version+1},{transaction});await event(p,'package_expired',transaction);
  }
}
// Las lecturas no toman locks si no hay nada que liquidar (evita competir con las confirmaciones de agenda).
const dueSettlement=(p,now)=>p.status==='paused'&&now-p.pausedAt>=Math.max(0,p.snapshot.policy.maxPauseHours-p.pausedHoursUsed)*3600000||['active','exhausted'].includes(p.status)&&p.expiresAt<=now;
async function settle(id){const ref=await Purchase.findByPk(id);if(!ref)return;if(!dueSettlement(ref,persistedSecond(new Date())))return ref;return sequelize.transaction(async transaction=>{await offers.teacherSettings(ref.teacherId,transaction);const p=await Purchase.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});await settleLocked(p,transaction,persistedSecond(new Date()));return p;});}
async function detail(user,id){await load(user,id);const p=await settle(id);const [view]=await decorate([present(p)]);// El motivo de un ajuste es una nota interna de quien lo hizo: el comprador ve qué cambió, no por qué (D3-DIN-07).
  const ledger=(await Ledger.findAll({where:{purchaseId:p.id},order:[['id','ASC']]})).map(e=>e.operation==='adjust'?{...e.toJSON(),reason:null,actorId:null}:e);
  return {...view,ledger};}
async function list(user){const refs=await Beneficiary.findAll({where:{userId:user.id},attributes:['purchaseId']});const rows=await Purchase.findAll({where:{[Op.or]:[{buyerId:user.id},{id:refs.map(r=>r.purchaseId)}]},order:[['expiresAt','ASC'],['id','ASC']]});const result=[];for(const row of rows)result.push(present(await settle(row.id)));return decorate(result);}
async function teacherList(user,studentId){
  if(user.role!=='teacher')throw fail(403,'forbidden');if(studentId!==undefined&&!validId(studentId))throw invalid(['studentId']);
  let ids=[];if(studentId!==undefined)ids=(await Beneficiary.findAll({where:{userId:studentId},attributes:['purchaseId']})).map(b=>b.purchaseId);
  const rows=await Purchase.findAll({where:{teacherId:user.id,...(studentId===undefined?{}:{[Op.or]:[{buyerId:studentId},{id:ids}]})},order:[['expiresAt','ASC'],['id','ASC']]});
  // Solo el nombre visible de la compradora (sin email ni otros datos) para identificar de quién es cada compra.
  const buyers=new Map((await User.findAll({where:{id:[...new Set(rows.map(r=>r.buyerId))]},attributes:['id','name']})).map(u=>[u.id,u.name]));
  const result=[];for(const p of rows)result.push({...present(await settle(p.id)),buyerName:buyers.get(p.buyerId)??null});return decorate(result);
}
async function unresolved(p,transaction,now){
  const participants=await Participant.findAll({where:{purchaseId:p.id,status:{[Op.ne]:'cancelled'}},attributes:['sessionId'],transaction});
  const ids=[...new Set(participants.map(x=>x.sessionId))];if(!ids.length)return p.unitsReserved>0;
  const sessions=await Session.findAll({where:{id:ids,status:['draft','forming','proposed','confirmed']},transaction});
  const proposals=await Proposal.findAll({where:{sessionId:ids,status:'pending',expiresAt:{[Op.gt]:now}},transaction});
  return p.unitsReserved>0||sessions.some(s=>!s.endsAt||s.endsAt>now)||proposals.length>0;
}
async function change(user,id,action,body,{now:clock=new Date()}={}){
  if(!only(body,['version','reason'])||!positive(body.version)||body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>500))throw invalid(['version','reason']);
  const ref=await load(user,id);if(ref.buyerId!==user.id)throw fail(404,'not_found');
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction);const p=await load(user,id,{transaction,lock:true});const now=persistedSecond(clock);
    if(p.version!==body.version)throw fail(409,'version_conflict');
    if(action==='resume'){
      if(p.status!=='paused')throw fail(409,'package_not_active');await resumeLocked(p,transaction,now);
    }else{
      if(!['active','paused'].includes(p.status)||p.status!=='paused'&&p.expiresAt<=now)throw fail(409,'package_not_active');
      if(await unresolved(p,transaction,now))throw fail(409,'sessions_pending_resolution');
      if(action==='pause'){
        const rules=p.snapshot.policy;
        if(p.status!=='active'||p.pauseCount>=rules.maxPauses||p.pausedHoursUsed>=rules.maxPauseHours)throw fail(409,'package_not_active');
        await p.update({status:'paused',pausedAt:now,pauseCount:p.pauseCount+1,version:p.version+1},{transaction});
        await outbox.enqueue({topic:'purchase.resume',aggregateType:'class_package_purchases',aggregateId:p.id,dedupeKey:`purchase.resume:${p.id}:${p.pauseCount}`,payload:{},runAt:new Date(now.getTime()+(rules.maxPauseHours-p.pausedHoursUsed)*3600000)},{transaction});await event(p,'package_paused',transaction);
      }else if(action==='cancel'){
        if(!body.reason?.trim())throw invalid(['reason']);
        await p.update({status:'cancelled',cancelledAt:now,version:p.version+1},{transaction});
        await AuditLog.create({actorId:user.id,action:'purchase.cancelled',entityType:'class_package_purchases',entityId:p.id,reason:body.reason.trim()},{transaction});
        await require('./classPayments').reviewJob({id:p.orderId},'package_cancelled',transaction);await event(p,'package_cancelled',transaction);
      }
    }
    return present(p);
  });
}
// class_credits.adjust solo alcanza las compras del propio docente; cualquier otra exige class_credits.adjust_any.
const canAdjust=(actor,p)=>p.teacherId===actor.id||require('../config/permissions').hasPermission(actor,'class_credits.adjust_any');
async function adjust(actor,id,body,key){
  offers.key(key);
  if(body&&Number.isSafeInteger(body.units)&&body.units>MAX_ADJUST_UNITS)throw fail(400,'adjust_units_too_high',{max:MAX_ADJUST_UNITS});
  if(!validId(id)||!only(body,['units','direction','reason','version'])||!positive(body.units)||!['add','remove','restore'].includes(body.direction)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500||body.version!==undefined&&!positive(body.version))throw invalid();
  const ref=await Purchase.findByPk(id);if(!ref||!canAdjust(actor,ref))throw fail(404,'not_found');
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction);const p=await Purchase.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
    const existing=await AuditLog.findOne({where:{actorId:actor.id,action:'credits.adjust',entityType:'class_package_purchases',entityId:p.id,'data.idempotencyKey':key},transaction});
    if(existing){if(existing.data.units!==body.units||existing.data.direction!==body.direction||existing.reason!==body.reason.trim())throw fail(409,'operation_key_conflict');return present(p);}
    if(body.version!==undefined&&p.version!==body.version)throw fail(409,'version_conflict');
    const audit=await AuditLog.create({actorId:actor.id,action:'credits.adjust',entityType:'class_package_purchases',entityId:p.id,reason:body.reason.trim(),data:{idempotencyKey:key,units:body.units,direction:body.direction}},{transaction});
    const adjust=body.direction==='add'?{from:'none',to:'available'}:body.direction==='remove'?{from:'available',to:'none'}:{from:'consumed',to:'available'};
    const result=await credits.apply({purchaseId:p.id,operation:'adjust',units:body.units,operationKey:`adjust:audit:${audit.id}`,actorId:actor.id,reason:body.reason.trim(),adjust},{transaction});
    return present(result.purchase);
  });
}
outbox.register('purchase.expire',job=>settle(job.aggregateId));outbox.register('purchase.resume',job=>settle(job.aggregateId));
module.exports={load,present,settle,detail,list,teacherList,change,adjust,unresolved,canAdjust,decorate,MAX_ADJUST_UNITS};
