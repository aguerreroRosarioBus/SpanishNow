const {randomBytes}=require('crypto');
const sequelize=require('../config/database');
const {User,Conversation,ClassPackageOrder:Order,ClassOffer:Offer,ClassPackagePurchase:Purchase,ClassCohort:Cohort}=require('../models');
const payments=require('../config/payments');
const offers=require('./classOffers');
const legal=require('./legalDocuments');
const {fail}=legal;
const present=order=>order?{id:order.id,offerId:order.offerId,provider:order.provider,status:order.status,amount:order.amount,currency:order.currency,paidAt:order.paidAt,refundedAt:order.refundedAt,refundedAmount:order.refundedAmount,reviewReason:order.reviewReason}:null;
function checkoutUrl(offer,order,user){
  if(order.provider==='fake')return `${payments.frontendUrl()}/class-offers/${offer.id}?checkout=fake`;
  const url=new URL(offer.snapshot.hotmartCheckoutUrl);
  url.searchParams.set('off',offer.hotmartOfferCode);url.searchParams.set('sck',order.checkoutRef);
  url.searchParams.set('email',user.email);if(user.name)url.searchParams.set('name',user.name);
  return url.toString();
}
async function buyerOffer(user,id,options={}){
  const offer=await offers.load(user,id,options);
  if(offer.buyerId!==user.id)throw fail(404,'not_found');return offer;
}
async function status(user,id){
  const offer=await buyerOffer(user,id);
  const order=await Order.findOne({where:{offerId:offer.id,buyerId:user.id},order:[['id','DESC']]});
  const purchase=await Purchase.findOne({where:{offerId:offer.id},attributes:['id']});
  return {offer:{...offers.present(offer),canCheckout:true,canManage:false},order:present(order),purchaseId:purchase?.id||null};
}
async function start(user,id,idempotencyKey,body={}){
  offers.key(idempotencyKey);
  const ref=await buyerOffer(user,id);
  await require('./classPackageProvider').assertSelling();
  payments.assertSafe();
  return sequelize.transaction(async transaction=>{
    await offers.teacherSettings(ref.teacherId,transaction,{selling:true});
    await Conversation.findByPk(ref.conversationId,{transaction,lock:transaction.LOCK.UPDATE});
    const offer=await buyerOffer(user,id,{transaction,lock:transaction.LOCK.UPDATE});
    // También serializa una clave reutilizada por el mismo comprador entre ofertas/docentes distintos.
    await User.findByPk(user.id,{transaction,lock:transaction.LOCK.UPDATE});
    const prior=await Order.findOne({where:{buyerId:user.id,idempotencyKey},transaction});
    if(prior&&prior.offerId!==offer.id)throw fail(409,'operation_key_conflict');
    if(prior&&prior.status!=='pending')return {order:present(prior),checkoutUrl:null};
    if(offer.expiresAt<=new Date())throw fail(409,'offer_expired');
    if(!['sent','checkout_pending'].includes(offer.status))throw fail(409,'offer_not_payable');
    if(await Order.findOne({where:{offerId:offer.id,status:['paid','paid_needs_review','partially_refunded','refunded']},transaction}))throw fail(409,'offer_not_payable');
    if(offer.cohortId){
      const cohort=await Cohort.findByPk(offer.cohortId,{transaction});
      if(!cohort||!['forming','ready'].includes(cohort.status)||cohort.formingDeadlineAt<=new Date())throw fail(409,'group_incomplete');
    }
    const existing=await Order.findOne({where:{offerId:offer.id,status:'pending'},transaction,lock:transaction.LOCK.UPDATE});
    const docs=offer.snapshot.legalDocuments||[];const contractual=docs.filter(d=>d.documentKey!=='privacy');
    const locale=body.locale||user.locale||'en';legal.validateConsent(body.legalConsent,contractual,locale);
    const order=existing||await Order.create({offerId:offer.id,buyerId:user.id,amount:offer.amount,currency:offer.currency,provider:payments.fake()?'fake':'hotmart',status:'pending',checkoutRef:randomBytes(16).toString('hex'),idempotencyKey},{transaction});
    if(existing&&existing.provider!==(payments.fake()?'fake':'hotmart'))throw fail(409,'offer_not_payable');
    await legal.recordAcceptances(user.id,docs,{locale,context:'checkout',contextType:'class_offer',contextId:offer.id,transaction});
    await offer.update({status:'checkout_pending'},{transaction});
    return {order:present(order),checkoutUrl:checkoutUrl(offer,order,user)};
  });
}
function fakeBody(order,offer,event='PURCHASE_APPROVED',eventId=`fake-package-${order.id}-approved`){
  const digits=new Intl.NumberFormat('en',{style:'currency',currency:order.currency}).resolvedOptions().maximumFractionDigits;
  return {id:eventId,event,version:'2.0.0',creation_date:Date.now(),data:{product:{id:offer.hotmartProductId},buyer:{email:'fictional-buyer@fake.invalid'},purchase:{transaction:`FAKE-PACKAGE-${order.id}`,status:event==='PURCHASE_REFUNDED'?'REFUNDED':'APPROVED',approved_date:Date.now(),price:{value:order.amount/10**digits,currency_value:order.currency},offer:{code:offer.hotmartOfferCode},origin:{sck:order.checkoutRef}}}};
}
async function completeFake(user,id){
  if(!payments.fake())throw fail(404,'not_found');payments.assertSafe();
  const offer=await buyerOffer(user,id);
  const order=await Order.findOne({where:{offerId:offer.id,buyerId:user.id,provider:'fake'},order:[['id','DESC']]});
  if(!order)throw fail(404,'not_found');
  const body=fakeBody(order,offer);
  body.data.buyer.email=user.email;
  await require('./classPayments').handleEvent(body,{provider:'fake'});
  return status(user,id);
}
module.exports={present,buyerOffer,status,start,fakeBody,completeFake};
