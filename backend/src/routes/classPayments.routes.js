const router=require('express').Router();
const {authMiddleware,requirePermission}=require('../middlewares/auth.middleware');
const {requireFeature}=require('../config/features');
const {fail}=require('../services/legalDocuments');
const checkout=require('../services/classCheckout');
const payments=require('../services/classPayments');
const review=require('../services/classPaymentReview');
const provider=require('../services/classPackageProvider');
require('../services/classPackageJobs');
const {ClassPackageOrder:Order,ClassPackagePurchase:Purchase,PaymentProviderEvent:Event,OutboxJob,AuditLog}=require('../models');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const secure=[authMiddleware,(req,res,next)=>req.impersonatedBy?next(fail(403,'forbidden',{reason:'impersonation'})):next()];
const purchaseView=p=>({purchaseStatus:p?.status??null,frozenFromStatus:p?.frozenFromStatus??null,unitsAvailable:p?.unitsAvailable??null,unitsReserved:p?.unitsReserved??null,unitsConsumed:p?.unitsConsumed??null});
router.post('/class-offers/:id/checkout',...secure,requireFeature('class_packages'),wrap(async(req,res)=>res.json(await checkout.start(req.user,req.params.id,req.get('Idempotency-Key'),req.body))));
router.get('/class-offers/:id/checkout',...secure,wrap(async(req,res)=>res.json(await checkout.status(req.user,req.params.id))));
router.post('/class-offers/:id/checkout/fake-complete',...secure,requireFeature('class_packages'),wrap(async(req,res)=>res.json(await checkout.completeFake(req.user,req.params.id))));
router.get('/admin/class-payments',...secure,requirePermission('class_payments.review'),wrap(async(req,res)=>{
  const status=req.query.status||'paid_needs_review';if(!['paid_needs_review','paid','refunded','partially_refunded','pending','failed'].includes(status))throw fail(400,'validation_failed');
  const items=await Order.findAll({where:{status},order:[['id','DESC']],limit:200});
  const purchases=new Map((await Purchase.findAll({where:{orderId:items.map(o=>o.id)}})).map(p=>[p.orderId,p]));
  const events=await Event.findAll({where:{outcome:'needs_review'},order:[['id','DESC']],limit:200});
  res.json({items:items.map(o=>({...checkout.present(o),reportedAmount:o.reportedAmount,reportedCurrency:o.reportedCurrency,providerTransactionId:o.providerTransactionId,providerProductId:o.providerProductId,providerOfferCode:o.providerOfferCode,...purchaseView(purchases.get(o.id))})),events:events.map(e=>({id:Number(e.id),orderId:e.orderId,eventType:e.eventType,payload:e.payload,outcome:e.outcome,createdAt:e.createdAt}))});
}));
router.get('/admin/class-provider',...secure,requirePermission('class_provider.verify','class_payments.review'),wrap(async(req,res)=>res.json(await provider.status())));
router.post('/admin/class-provider/verify',...secure,requirePermission('class_provider.verify'),wrap(async(req,res)=>res.json(await provider.verify(req.user,req.body))));
router.post('/admin/class-provider/revoke',...secure,requirePermission('class_provider.verify'),wrap(async(req,res)=>res.json(await provider.revoke(req.user,req.body))));
router.post('/admin/class-payments/:orderId/resolve',...secure,requirePermission('class_payments.review'),wrap(async(req,res)=>res.json(await review.resolve(req.user,req.params.orderId,req.body))));
const JOB_TOPICS=['payment.refund','review.class_payment','review.package_refund','review.incomplete_group','review.refunded_with_reservations','email.purchase_confirmed'];
router.get('/admin/class-payment-jobs',...secure,requirePermission('class_payments.review'),wrap(async(req,res)=>{
  const jobs=await OutboxJob.findAll({where:{topic:JOB_TOPICS,[require('sequelize').Op.or]:[{status:['pending','running','failed']},{topic:{[require('sequelize').Op.like]:'review.%'},status:'done'}]},order:[['id','DESC']],limit:200});
  const closed=await AuditLog.findAll({where:{action:'payment.attention_resolved',entityType:'outbox_jobs',entityId:jobs.map(j=>Number(j.id))},attributes:['entityId']});
  res.json(jobs.filter(j=>!closed.some(a=>a.entityId===Number(j.id))).map(j=>({id:Number(j.id),topic:j.topic,aggregateId:j.aggregateId,purchaseIds:j.payload?.purchaseIds||[],status:j.topic.startsWith('review.')&&j.status==='done'?'attention':j.status,attempts:j.attempts,lastError:j.lastError,runAt:j.runAt})));
}));
router.post('/admin/class-payment-jobs/:id/acknowledge',...secure,requirePermission('class_payments.review'),wrap(async(req,res)=>{
  if(!require('../services/legalDocuments').validId(req.params.id)||!require('../services/legalDocuments').only(req.body,['reason'])||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw fail(400,'validation_failed');
  const job=await OutboxJob.findByPk(req.params.id);if(!job||!JOB_TOPICS.includes(job.topic)||!job.topic.startsWith('review.'))throw fail(404,'not_found');
  await AuditLog.create({actorId:req.user.id,action:'payment.attention_resolved',entityType:'outbox_jobs',entityId:Number(job.id),reason:req.body.reason.trim()});res.json({acknowledged:true});
}));
router.post('/admin/class-payment-jobs/:id/retry',...secure,requirePermission('class_payments.review'),wrap(async(req,res)=>{
  if(!require('../services/legalDocuments').validId(req.params.id)||!require('../services/legalDocuments').only(req.body,['reason'])||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw fail(400,'validation_failed');
  await require('../config/database').transaction(async transaction=>{
    const job=await OutboxJob.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});
    if(!job||!JOB_TOPICS.includes(job.topic))throw fail(404,'not_found');if(job.status!=='failed')throw fail(409,'version_conflict');
    await job.update({status:'pending',attempts:0,runAt:new Date(),lastError:null},{transaction});
    await AuditLog.create({actorId:req.user.id,action:'payment.job_retry',entityType:'outbox_jobs',entityId:Number(job.id),reason:req.body.reason.trim()},{transaction});
  });res.json({retried:true});
}));
router.post('/admin/class-payments/:orderId/fake-refund-complete',...secure,requirePermission('class_payments.review'),wrap(async(req,res)=>{
  if(!require('../services/legalDocuments').validId(req.params.orderId))throw fail(404,'not_found');
  const config=require('../config/payments');if(!config.fake())throw fail(404,'not_found');config.assertSafe();
  const job=await OutboxJob.findOne({where:{topic:'payment.refund',aggregateId:req.params.orderId}});if(!job)throw fail(404,'not_found');
  await review.refund(job);res.json({confirmed:true});
}));
module.exports=router;
