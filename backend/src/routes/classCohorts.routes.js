const router=require('express').Router();
const {authMiddleware}=require('../middlewares/auth.middleware');
const {requireFeature}=require('../config/features');
const {fail}=require('../services/legalDocuments');
const cohorts=require('../services/classCohorts');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const secure=[authMiddleware,(req,res,next)=>req.impersonatedBy?next(fail(403,'forbidden',{reason:'impersonation'})):next()];
router.get('/teacher/class-cohorts',...secure,wrap(async(req,res)=>res.json(await cohorts.list(req.user))));
router.post('/teacher/class-cohorts',...secure,requireFeature('class_packages'),wrap(async(req,res)=>res.status(201).json(await cohorts.create(req.user,req.body))));
router.get('/teacher/class-cohorts/:id',...secure,wrap(async(req,res)=>res.json(await cohorts.detail(req.user,req.params.id))));
// Alias de lectura para invitados; no expone participantes ni pagos ajenos.
router.get('/class-cohorts/:id',...secure,wrap(async(req,res)=>res.json(await cohorts.detail(req.user,req.params.id))));
router.post('/class-cohorts/:id/invitation/accept',...secure,requireFeature('class_packages'),wrap(async(req,res)=>res.json(await cohorts.respond(req.user,req.params.id,true))));
router.post('/class-cohorts/:id/invitation/decline',...secure,wrap(async(req,res)=>res.json(await cohorts.respond(req.user,req.params.id,false))));
module.exports=router;
