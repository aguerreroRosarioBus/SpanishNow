const sequelize=require('../config/database');
const {Conversation,ClassPackageOrder:Order,ClassOffer:Offer,ClassPackagePurchase:Purchase,PaymentProviderEvent:Event,AuditLog}=require('../models');
const {fail,invalid,only,validId}=require('./legalDocuments');
const offers=require('./classOffers');
const checkout=require('./classCheckout');
const paymentEvents=require('./classPayments');
const outbox=require('./outbox');
const purchases=require('./classPurchases');
const config=require('../config/payments');
// Motivos de congelamiento por un reembolso que Hotmart informó y no se pudo validar (classPayments.freezeForReview).
const FROZEN_REASONS=['refund_mapping_mismatch','refund_amount_review','partial_refund_pending_validation'];
const frozenOrder=order=>order.status==='paid_needs_review'&&FROZEN_REASONS.includes(order.reviewReason);
// Concilia a mano un reembolso congelado: solo registra lo que ya ocurrió en Hotmart, no mueve dinero.
async function confirmRefund(actor,order,offer,body,transaction){
  const present=()=>({order:checkout.present(order),resolved:true});
  if(['refunded','partially_refunded'].includes(order.status))return present();
  if(!frozenOrder(order))throw fail(409,'offer_not_payable');
  const refundedAmount=body.refundedAmount??order.amount;
  if(!Number.isSafeInteger(refundedAmount)||refundedAmount<1||refundedAmount>order.amount)throw invalid(['refundedAmount']);
  const reviewReason=order.reviewReason;
  await paymentEvents.applyRefund(order,offer,{refundedAmount,operationKey:`refund:order:${order.id}:review`},transaction);
  await order.update({reviewResolvedAt:new Date(),reviewResolvedById:actor.id},{transaction});
  await AuditLog.create({actorId:actor.id,action:'payment.review',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{action:'confirm_refund',refundedAmount,reviewReason}},{transaction});
  return present();
}
// Falsa alarma: la orden vuelve a pagada y la compra al estado que tenía al congelarse. Las compras congeladas antes de
// guardar frozenFromStatus no se pueden descongelar automáticamente (409 payment_review_required).
async function unfreeze(actor,order,body,transaction){
  const purchase=await Purchase.findOne({where:{orderId:order.id},transaction,lock:transaction.LOCK.UPDATE});
  if(!frozenOrder(order)||!purchase||purchase.status!=='cancelled'||!purchase.frozenFromStatus)throw fail(409,'payment_review_required');
  const reviewReason=order.reviewReason,restoredStatus=purchase.frozenFromStatus;
  await order.update({status:'paid',reviewReason:null,reviewResolvedAt:new Date(),reviewResolvedById:actor.id},{transaction});
  await purchase.update({status:restoredStatus,cancelledAt:null,frozenFromStatus:null,version:purchase.version+1},{transaction});
  await Event.update({outcome:'ignored',processedAt:new Date()},{where:{orderId:order.id,providerTransactionId:order.providerTransactionId,outcome:'needs_review'},transaction});
  // Si venció o se acabó la pausa mientras estaba congelada, pasa a expired/resume por el camino normal (settle).
  const topic=restoredStatus==='paused'?'purchase.resume':'purchase.expire';
  const runAt=restoredStatus==='paused'?new Date(purchase.pausedAt.getTime()+Math.max(0,purchase.snapshot.policy.maxPauseHours-purchase.pausedHoursUsed)*3600000):purchase.expiresAt;
  await outbox.enqueue({topic,aggregateType:'class_package_purchases',aggregateId:purchase.id,dedupeKey:`${topic}:${purchase.id}:v${purchase.version}`,payload:{},runAt:runAt>new Date()?runAt:new Date()},{transaction});
  await AuditLog.create({actorId:actor.id,action:'payment.review',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{action:'unfreeze',reviewReason,restoredStatus}},{transaction});
  return {order:checkout.present(order),resolved:true,purchaseId:purchase.id};
}
async function resolve(actor,id,body){
  if(!validId(id)||!only(body,['action','reason','refundedAmount'])||!['credit','refund','confirm_refund','unfreeze'].includes(body.action)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)throw invalid();
  if(body.refundedAmount!==undefined&&(body.action!=='confirm_refund'||!Number.isSafeInteger(body.refundedAmount)||body.refundedAmount<1))throw invalid(['refundedAmount']);
  const ref=await Order.findByPk(id);if(!ref)throw fail(404,'not_found');const offerRef=await Offer.findByPk(ref.offerId);
  let settleId=null;
  const result=await sequelize.transaction(async transaction=>{
    await offers.teacherSettings(offerRef.teacherId,transaction);
    await Conversation.findByPk(offerRef.conversationId,{transaction,lock:transaction.LOCK.UPDATE});
    const offer=await Offer.findByPk(ref.offerId,{transaction,lock:transaction.LOCK.UPDATE});
    const order=await Order.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
    if(body.action==='credit'){
      if(order.status==='paid')return {order:checkout.present(order),resolved:true};
      if(order.status!=='paid_needs_review')throw fail(409,'offer_not_payable');
      if(!order.providerTransactionId||['partial_refund_pending_validation','duplicate_transaction'].includes(order.reviewReason))throw fail(409,'payment_review_required');
      if(order.reportedAmount!==order.amount||order.reportedCurrency!==order.currency||order.providerProductId!==offer.hotmartProductId||order.providerOfferCode!==offer.hotmartOfferCode)throw fail(409,'payment_review_required');
      if(await Purchase.findOne({where:{offerId:offer.id},transaction}))throw fail(409,'offer_not_payable');
      await order.update({status:'paid',reviewResolvedAt:new Date(),reviewResolvedById:actor.id},{transaction});
      await paymentEvents.grant(order,offer,transaction);
      await Event.update({outcome:'applied',processedAt:new Date()},{where:{orderId:order.id,providerTransactionId:order.providerTransactionId,outcome:'needs_review'},transaction});
      await AuditLog.create({actorId:actor.id,action:'payment.review',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{action:'credit'}},{transaction});
      return {order:checkout.present(order),resolved:true};
    }
    if(body.action==='confirm_refund')return confirmRefund(actor,order,offer,body,transaction);
    if(body.action==='unfreeze'){const done=await unfreeze(actor,order,body,transaction);settleId=done.purchaseId;return {order:done.order,resolved:true};}
    if(order.status==='refunded')return {order:checkout.present(order),resolved:true};
    if(!['paid','paid_needs_review'].includes(order.status))throw fail(409,'offer_not_payable');
    // Con compra existente el reembolso solo sigue las condiciones de P01 (reservas, plazo, cancelación) de classRefunds.review.
    if(await Purchase.findOne({where:{orderId:order.id},transaction}))throw fail(409,'payment_review_required');
    if(order.provider==='hotmart'){await AuditLog.create({actorId:actor.id,action:'payment.refund_manual',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{amount:order.amount,currency:order.currency}},{transaction});return {order:checkout.present(order),refundRequested:true,manualRequired:true};}
    const {created}=await outbox.enqueue({topic:'payment.refund',aggregateType:'class_package_orders',aggregateId:order.id,dedupeKey:`payment.refund:${order.id}`,payload:{reason:body.reason.trim()},runAt:new Date()},{transaction});
    if(created)await AuditLog.create({actorId:actor.id,action:'payment.refund_requested',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{amount:order.amount,currency:order.currency}},{transaction});
    return {order:checkout.present(order),refundRequested:true};
  });
  if(settleId)await purchases.settle(settleId);
  return result;
}
async function refund(job){
  const order=await Order.findByPk(job.aggregateId);if(!order||order.status==='refunded')return;
  if(order.provider!=='fake'||!config.fake())throw fail(503,'payments_unavailable');config.assertSafe();
  const offer=await Offer.findByPk(order.offerId);
  await paymentEvents.handleEvent(checkout.fakeBody(order,offer,'PURCHASE_REFUNDED',`fake-package-refund-${order.id}`),{provider:'fake'});
}
outbox.register('payment.refund',refund);
module.exports={resolve,refund};
