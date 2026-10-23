const sequelize=require('../config/database');
const {Conversation,ClassPackageOrder:Order,ClassOffer:Offer,ClassPackagePurchase:Purchase,PaymentProviderEvent:Event,AuditLog}=require('../models');
const {fail,invalid,only,validId}=require('./legalDocuments');
const offers=require('./classOffers');
const checkout=require('./classCheckout');
const paymentEvents=require('./classPayments');
const outbox=require('./outbox');
const config=require('../config/payments');
async function resolve(actor,id,body){
  if(!validId(id)||!only(body,['action','reason'])||!['credit','refund'].includes(body.action)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)throw invalid();
  const ref=await Order.findByPk(id);if(!ref)throw fail(404,'not_found');const offerRef=await Offer.findByPk(ref.offerId);
  return sequelize.transaction(async transaction=>{
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
    if(order.status==='refunded')return {order:checkout.present(order),resolved:true};
    if(!['paid','paid_needs_review'].includes(order.status))throw fail(409,'offer_not_payable');
    // Con compra existente el reembolso solo sigue las condiciones de P01 (reservas, plazo, cancelación) de classRefunds.review.
    if(await Purchase.findOne({where:{orderId:order.id},transaction}))throw fail(409,'payment_review_required');
    if(order.provider==='hotmart'){await AuditLog.create({actorId:actor.id,action:'payment.refund_manual',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{amount:order.amount,currency:order.currency}},{transaction});return {order:checkout.present(order),refundRequested:true,manualRequired:true};}
    const {created}=await outbox.enqueue({topic:'payment.refund',aggregateType:'class_package_orders',aggregateId:order.id,dedupeKey:`payment.refund:${order.id}`,payload:{reason:body.reason.trim()},runAt:new Date()},{transaction});
    if(created)await AuditLog.create({actorId:actor.id,action:'payment.refund_requested',entityType:'class_package_orders',entityId:order.id,reason:body.reason.trim(),data:{amount:order.amount,currency:order.currency}},{transaction});
    return {order:checkout.present(order),refundRequested:true};
  });
}
async function refund(job){
  const order=await Order.findByPk(job.aggregateId);if(!order||order.status==='refunded')return;
  if(order.provider!=='fake'||!config.fake())throw fail(503,'payments_unavailable');config.assertSafe();
  const offer=await Offer.findByPk(order.offerId);
  await paymentEvents.handleEvent(checkout.fakeBody(order,offer,'PURCHASE_REFUNDED',`fake-package-refund-${order.id}`),{provider:'fake'});
}
outbox.register('payment.refund',refund);
module.exports={resolve,refund};
