const router = require('express').Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const offers = require('../services/classOffers');
const { fail } = require('../services/legalDocuments');
const wrap = fn => (req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const secure=[authMiddleware,(req,res,next)=>req.impersonatedBy?next(fail(403,'forbidden',{reason:'impersonation'})):next()];
router.get('/conversations/:id/offers',...secure,wrap(async(req,res)=>res.json(await offers.list(req.user,req.params.id))));
router.post('/conversations/:id/offers',...secure,requireFeature('class_packages'),wrap(async(req,res)=>{
  const {offer,created}=await offers.send(req.user,req.params.id,req.body,req.get('Idempotency-Key'));res.status(created?201:200).json(offer);
}));
router.get('/class-offers/:id',...secure,wrap(async(req,res)=>res.json(await offers.detail(req.user,req.params.id))));
router.post('/class-offers/:id/cancel',...secure,wrap(async(req,res)=>res.json(await offers.cancel(req.user,req.params.id,req.body))));
router.post('/class-offers/:id/replace',...secure,requireFeature('class_packages'),wrap(async(req,res)=>{
  const old=await offers.load(req.user,req.params.id);
  const {offer,created}=await offers.send(req.user,old.conversationId,req.body,req.get('Idempotency-Key'),{replacesOfferId:old.id});res.status(created?201:200).json(offer);
}));
module.exports=router;
