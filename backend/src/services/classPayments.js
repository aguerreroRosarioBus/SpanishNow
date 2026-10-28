const {createHash}=require('crypto');
const {Op}=require('sequelize');
const sequelize=require('../config/database');
const {User,Conversation,ClassPackageTemplateVersion:Version,ClassOffer:Offer,ClassOfferBeneficiary:OfferBeneficiary,ClassPackageOrder:Order,ClassPackagePurchase:Purchase,ClassPackageBeneficiary:Beneficiary,PaymentProviderEvent:Event,ClassCohort:Cohort,ClassCohortMember:Member,AuditLog}=require('../models');
const offers=require('./classOffers');
const credits=require('./classCredits');
const chat=require('./chatService');
const outbox=require('./outbox');
const {fail,invalid,only,validId,persistedSecond}=require('./legalDocuments');
const APPROVED=new Set(['PURCHASE_APPROVED','PURCHASE_COMPLETE']);
const REFUNDED=new Set(['PURCHASE_REFUNDED','PURCHASE_CHARGEBACK']);
const FAILED=new Set(['PURCHASE_CANCELED','PURCHASE_EXPIRED','PURCHASE_PROTEST']);
const text=(value,max)=>{if(typeof value!=='string'&&typeof value!=='number')return null;const str=String(value);return str.length<=max?str:null;};
function amountOf(price){
  const currency=text(price?.currency_value,3)?.toUpperCase();
  if(!currency||!Intl.supportedValuesOf('currency').includes(currency))return null;
  const digits=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
  const str=String(price.value??'');if(!/^\d{1,12}(?:\.\d{1,10})?$/.test(str))return null;
  const [whole,fraction='']=str.split('.');if(fraction.slice(digits).replace(/0/g,''))return null;
  const amount=Number(BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.slice(0,digits).padEnd(digits,'0')||'0'));
  return Number.isSafeInteger(amount)&&amount<=2147483647?{amount,currency}:null;
}
function normalize(body){
  const data=body?.data||{},purchase=data.purchase||{};
  const eventType=text(body?.event,64)||'unknown';const transactionId=text(purchase.transaction,64);
  const productId=text(data.product?.id??data.product?.ucode,40);
  const offerCode=text(purchase.offer?.code,40);const checkoutRef=text(purchase.origin?.sck||purchase.origin?.xcod,191);
  const reported=amountOf(purchase.price);const buyerEmail=text(data.buyer?.email,255);
  const date=Number(purchase.approved_date);const approvedAt=Number.isFinite(date)&&date>0&&date<=Date.now()+60000?persistedSecond(new Date(date)):null;
  const payload={event:eventType,productId,offerCode,checkoutRef,transactionId,price:reported,status:text(purchase.status,32),approvedAt:approvedAt?.toISOString()||null};
  const eventKey=text(body?.id,191)||`${eventType}:${transactionId||createHash('sha256').update(JSON.stringify(payload)).digest('hex')}:${payload.status||''}`.slice(0,191);
  return {eventType,eventKey,transactionId,productId,offerCode,checkoutRef,reported,buyerEmail,approvedAt,payload};
}
async function reviewJob(order,reason,transaction){
  await outbox.enqueue({topic:'review.class_payment',aggregateType:'class_package_orders',aggregateId:order.id,dedupeKey:`review:order:${order.id}:${reason}`,payload:{reason},runAt:new Date()},{transaction});
}
async function markReview(order,offer,n,reason,transaction){
  await order.update({status:'paid_needs_review',reviewReason:reason,paidAt:order.paidAt||n.approvedAt||persistedSecond(new Date()),providerProductId:n.productId||order.providerProductId,providerOfferCode:n.offerCode||order.providerOfferCode,reportedAmount:n.reported?.amount??null,reportedCurrency:n.reported?.currency??null,buyerEmailReported:n.buyerEmail}, {transaction});
  await reviewJob(order,reason,transaction);
  await chat.appendSystemMessage(offer.conversationId,{eventCode:'package_payment_review',offerId:offer.id,eventParams:{offerId:offer.id},dedupeKey:`order:${order.id}:review`},{transaction});
}
// Reembolso que no se puede validar: la orden pasa a revisión y la compra deja de ser usable (no reserva ni consume más).
async function freezeForReview(order,offer,n,reason,transaction){
  await markReview(order,offer,n,reason,transaction);
  const purchase=await Purchase.findOne({where:{orderId:order.id},transaction,lock:transaction.LOCK.UPDATE});
  if(!purchase)return;
  // Se guarda el estado previo para poder descongelar una falsa alarma; si ya estaba congelada no se pisa.
  if(purchase.status!=='cancelled')await purchase.update({status:'cancelled',cancelledAt:persistedSecond(new Date()),frozenFromStatus:purchase.frozenFromStatus||purchase.status,version:purchase.version+1},{transaction});
  if(purchase.unitsReserved)await outbox.enqueue({topic:'review.refunded_with_reservations',aggregateType:'class_package_purchases',aggregateId:purchase.id,dedupeKey:`review:purchase:${purchase.id}:reserved-refund`,payload:{orderId:order.id},runAt:new Date()},{transaction});
}
async function grant(order,offer,transaction){
  const existing=await Purchase.findOne({where:{offerId:offer.id},transaction});
  if(existing)return existing;
  const paidAt=order.paidAt||persistedSecond(new Date());
  const purchase=await Purchase.create({orderId:order.id,offerId:offer.id,teacherId:offer.teacherId,buyerId:offer.buyerId,cohortId:offer.cohortId,templateVersionId:offer.templateVersionId,policyVersionId:offer.policyVersionId,snapshot:offer.snapshot,minutesPerSession:offer.minutesPerSession,seatsCovered:offer.seatsCovered,status:'active',paidAt,expiresAt:new Date(paidAt.getTime()+offer.validityHours*3600000)},{transaction});
  const people=await OfferBeneficiary.findAll({where:{offerId:offer.id},transaction});
  await Beneficiary.bulkCreate(people.map(b=>({purchaseId:purchase.id,userId:b.userId})),{transaction});
  await credits.apply({purchaseId:purchase.id,operation:'grant',units:offer.sessionsCount,operationKey:`grant:order:${order.id}`},{transaction});
  await offer.update({status:'paid'},{transaction});
  await outbox.cancel({aggregateType:'class_offers',aggregateId:offer.id,topicPrefix:'offer.expire'},{transaction});
  await outbox.enqueue({topic:'purchase.expire',aggregateType:'class_package_purchases',aggregateId:purchase.id,dedupeKey:`purchase.expire:${purchase.id}:initial`,payload:{},runAt:purchase.expiresAt},{transaction});
  await chat.appendSystemMessage(offer.conversationId,{eventCode:'package_payment_confirmed',offerId:offer.id,eventParams:{purchaseId:purchase.id,offerId:offer.id,units:offer.sessionsCount},dedupeKey:`order:${order.id}:paid`},{transaction});
  await outbox.enqueue({topic:'email.purchase_confirmed',aggregateType:'class_package_purchases',aggregateId:purchase.id,dedupeKey:`email:purchase:${purchase.id}:confirmed`,payload:{buyerId:offer.buyerId},runAt:new Date()},{transaction});
  if(offer.cohortId){
    const cohort=await Cohort.findByPk(offer.cohortId,{transaction,lock:transaction.LOCK.UPDATE});
    const purchases=await Purchase.findAll({where:{cohortId:cohort.id,status:'active'},transaction});
    const members=await Member.findAll({where:{cohortId:cohort.id,status:'accepted'},transaction});
    const covered=new Set(purchases.flatMap(p=>p.snapshot.beneficiaryIds));
    if(cohort.status==='forming'&&members.length===cohort.groupSize&&members.every(m=>covered.has(m.userId)))await cohort.update({status:'ready'},{transaction});
  }
  return purchase.reload({transaction});
}
// Reembolso ya informado por Hotmart (confirmado por el webhook o conciliado a mano tras una revisión): orden reembolsada
// (total) o parcialmente reembolsada, saldo disponible retirado, compra cancelada y oferta cerrada. No mueve dinero.
async function applyRefund(order,offer,{refundedAmount,operationKey},transaction){
  await order.update({status:refundedAmount===order.amount?'refunded':'partially_refunded',refundedAmount,refundedAt:persistedSecond(new Date())},{transaction});
  await Event.update({outcome:'applied',processedAt:new Date()},{where:{orderId:order.id,providerTransactionId:order.providerTransactionId,outcome:'needs_review'},transaction});
  const purchase=await Purchase.findOne({where:{orderId:order.id},transaction,lock:transaction.LOCK.UPDATE});
  if(purchase){
    if(purchase.unitsAvailable)await credits.apply({purchaseId:purchase.id,operation:'refund',units:purchase.unitsAvailable,operationKey},{transaction});
    await purchase.update({status:'cancelled',cancelledAt:persistedSecond(new Date()),frozenFromStatus:null,version:purchase.version+1},{transaction});
    if(purchase.unitsReserved)await outbox.enqueue({topic:'review.refunded_with_reservations',aggregateType:'class_package_purchases',aggregateId:purchase.id,dedupeKey:`review:purchase:${purchase.id}:reserved-refund`,payload:{orderId:order.id},runAt:new Date()},{transaction});
  }
  if(offer.status!=='paid')await offer.update({status:'cancelled',cancelledAt:persistedSecond(new Date()),cancelReason:'Reembolso confirmado por el proveedor'},{transaction});
  await chat.appendSystemMessage(offer.conversationId,{eventCode:'package_payment_refunded',offerId:offer.id,eventParams:{offerId:offer.id},dedupeKey:`order:${order.id}:refunded`},{transaction});
}
async function handleEvent(body,{provider='hotmart'}={}){
  const n=normalize(body);
  const knownOrder=n.checkoutRef?await Order.findOne({where:{checkoutRef:n.checkoutRef}}):null;
  const byTransaction=n.transactionId?await Order.findOne({where:{providerTransactionId:n.transactionId}}):null;
  const version=n.productId?await Version.findOne({where:{hotmartProductId:n.productId},attributes:['id']}):null;
  if(!knownOrder&&!byTransaction&&!version){
    await Event.findOrCreate({where:{provider,eventKey:n.eventKey},defaults:{eventType:n.eventType,providerTransactionId:n.transactionId,payload:n.payload,occurredAt:n.approvedAt||new Date(),outcome:'ignored',processedAt:new Date()}});
    return {handled:false};
  }
  // La atribución jamás usa el email del comprador: una referencia ausente/ambigua pasa a revisión.
  const ref=knownOrder||byTransaction;
  const work=()=>sequelize.transaction(async transaction=>{
    const [event]=await Event.findOrCreate({where:{provider,eventKey:n.eventKey},defaults:{eventType:n.eventType,providerTransactionId:n.transactionId,payload:n.payload,occurredAt:n.approvedAt||new Date(),orderId:ref?.id||null},transaction});
    const lockedEvent=await Event.findByPk(event.id,{transaction,lock:transaction.LOCK.UPDATE});
    if(['applied','ignored','needs_review'].includes(lockedEvent.outcome))return {handled:true,replayed:true};
    const finish=async(outcome,result={})=>{await lockedEvent.update({outcome,processedAt:new Date()},{transaction});return {handled:true,...result};};
    if(n.payload.status!=='PARTIALLY_REFUNDED'&&!APPROVED.has(n.eventType)&&!REFUNDED.has(n.eventType)&&!FAILED.has(n.eventType))return finish('ignored');
    if(!ref||!n.transactionId){
      await outbox.enqueue({topic:'review.class_payment',aggregateType:'payment_provider_events',aggregateId:Number(event.id),dedupeKey:`review:event:${event.id}`,payload:{reason:ref?'missing_transaction':'missing_reference'},runAt:new Date()},{transaction});
      return finish('needs_review',{needsReview:true});
    }
    const offerRef=await Offer.findByPk(ref.offerId,{transaction});
    await offers.teacherSettings(offerRef.teacherId,transaction);
    await Conversation.findByPk(offerRef.conversationId,{transaction,lock:transaction.LOCK.UPDATE});
    const offer=await Offer.findByPk(ref.offerId,{transaction,lock:transaction.LOCK.UPDATE});
    const order=await Order.findByPk(ref.id,{transaction,lock:transaction.LOCK.UPDATE});
    await lockedEvent.update({orderId:order.id},{transaction});
    if(order.provider!==provider)return finish('needs_review',{needsReview:true});
    const txOwner=await Order.findOne({where:{providerTransactionId:n.transactionId},transaction});
    if(txOwner&&txOwner.id!==order.id){await markReview(order,offer,n,'duplicate_transaction',transaction);return finish('needs_review',{needsReview:true});}
    // Un intento fallido no fija la transacción: un pago real posterior con el mismo link debe poder conciliarse.
    if(!order.providerTransactionId){if(!FAILED.has(n.eventType))await order.update({providerTransactionId:n.transactionId},{transaction});}
    else if(order.providerTransactionId!==n.transactionId){
      // Otro cobro real sobre el mismo link: no se vuelve a acreditar ni se borra el pago original.
      await reviewJob(order,'additional_transaction',transaction);return finish('needs_review',{needsReview:true});
    }
    if(n.payload.status==='PARTIALLY_REFUNDED'){
      if(order.status==='refunded')return finish('ignored',{replayed:true});
      await freezeForReview(order,offer,n,'partial_refund_pending_validation',transaction);
      await lockedEvent.update({error:'partial_refund_pending_validation'},{transaction});
      return finish('needs_review',{needsReview:true});
    }
    if(APPROVED.has(n.eventType)){
      if(['paid','paid_needs_review','partially_refunded','refunded'].includes(order.status))return finish('ignored',{replayed:true});
      const reason=order.status==='failed'||!['sent','checkout_pending'].includes(offer.status)||offer.expiresAt<=new Date()?'offer_closed':
        order.checkoutExpiresAt&&(n.approvedAt||new Date())>order.checkoutExpiresAt?'checkout_link_expired':
        n.productId!==offer.hotmartProductId?'product_mismatch':n.offerCode!==offer.hotmartOfferCode?'offer_code_mismatch':
        !n.reported?'price_missing':n.reported.amount!==offer.amount||n.reported.currency!==offer.currency?'price_mismatch':null;
      if(reason){await markReview(order,offer,n,reason,transaction);return finish('needs_review',{needsReview:true});}
      const buyer=await User.findByPk(offer.buyerId,{transaction});
      await order.update({status:'paid',paidAt:n.approvedAt||persistedSecond(new Date()),providerProductId:n.productId,providerOfferCode:n.offerCode,reportedAmount:n.reported.amount,reportedCurrency:n.reported.currency,buyerEmailReported:n.buyerEmail},{transaction});
      if(n.buyerEmail&&n.buyerEmail.toLowerCase()!==buyer.email.toLowerCase())await AuditLog.create({action:'payment.email_mismatch',entityType:'class_package_orders',entityId:order.id,data:{buyerId:buyer.id}},{transaction});
      await grant(order,offer,transaction);return finish('applied');
    }
    if(REFUNDED.has(n.eventType)){
      if(order.status==='refunded')return finish('ignored',{replayed:true});
      const mismatch=n.productId!==offer.hotmartProductId||n.offerCode&&n.offerCode!==offer.hotmartOfferCode?'refund_mapping_mismatch':
        n.reported&&(n.reported.amount!==order.amount||n.reported.currency!==order.currency)?'refund_amount_review':null;
      if(mismatch){await freezeForReview(order,offer,n,mismatch,transaction);return finish('needs_review',{needsReview:true});}
      await applyRefund(order,offer,{refundedAmount:order.amount,operationKey:`refund:order:${order.id}:${createHash('sha256').update(n.eventKey).digest('hex').slice(0,24)}`},transaction);
      return finish('applied');
    }
    if(FAILED.has(n.eventType)&&order.status==='pending'){
      await order.update({status:'failed',failedAt:persistedSecond(new Date())},{transaction});
      if(offer.status==='checkout_pending')await offer.update({status:offer.expiresAt>new Date()?'sent':'expired'},{transaction});
    }
    return finish('applied');
  });
  for(let attempt=0;;attempt++){
    try{return await work();}catch(e){if(attempt>=2||!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_DUP_ENTRY'].includes(e.parent?.code))throw e;}
  }
}
module.exports={amountOf,normalize,presentOrder:require('./classCheckout').present,handleEvent,grant,reviewJob,applyRefund};
