const { randomUUID } = require('crypto');
const request = require('supertest');
const { app, as, createUser } = require('./helpers/fixtures');
const { packageWorld } = require('./helpers/classPackages');
const { ClassOffer: Offer, ClassOfferBeneficiary, Message, OutboxJob, ClassPackageOrder: Order, TeacherClassSettings, ClassPackageTemplateVersion: Version }=require('../src/models');
const offers=require('../src/services/classOffers');
const send=(w,key=randomUUID(),body={templateVersionId:w.version.id})=>as(w.teacher).post(`/api/conversations/${w.conversation.id}/offers`,body).set('Idempotency-Key',key);
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';});
afterEach(()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;});
test('oferta inmutable 4×50 USD 90: snapshot, política, beneficiario, mensaje y expiración durables',async()=>{
  const w=await packageWorld();const key=randomUUID();const [a,b]=await Promise.all([send(w,key),send(w,key)]);
  expect([a.status,b.status].sort()).toEqual([200,201]);expect(a.body.id).toBe(b.body.id);
  const offer=a.body;expect(offer).toMatchObject({amount:9000,currency:'USD',status:'sent',snapshot:{templateVersion:2,teacherId:w.teacher.id,buyerId:w.buyer.id,beneficiaryIds:[w.buyer.id],sessionsCount:4,minutesPerSession:50,validityHours:2160,policy:{offerTtlHours:168}}});
  expect(offer.snapshot.hotmartCheckoutUrl).toBeUndefined();expect(Date.parse(offer.expiresAt)-Date.parse(offer.sentAt)).toBe(168*3600000);
  expect(await ClassOfferBeneficiary.count({where:{offerId:offer.id}})).toBe(1);
  expect(await Message.count({where:{offerId:offer.id,type:'offer'}})).toBe(1);
  expect(await OutboxJob.count({where:{aggregateType:'class_offers',aggregateId:offer.id,topic:'offer.expire'}})).toBe(1);
  const stored=(await Offer.findByPk(offer.id)).snapshot;
  const catalog=require('../src/services/classCatalog');const values=Object.fromEntries(catalog.FIELDS.map(k=>[k,w.version[k]]));
  await catalog.newVersion(w.teacher,w.template.id,{...values,version:w.version.version,nameEn:'Changed catalog for test',priceAmount:1500});
  expect((await Offer.findByPk(offer.id)).snapshot).toEqual(stored);
  expect((await send(w,key,{templateVersionId:w.version.id,beneficiaryIds:[w.other.id]})).body.code).toBe('operation_key_conflict');
});
test('lecturas privadas incluso con permisos admin; impersonación y compra por tercero rechazadas',async()=>{
  const w=await packageWorld();const offer=(await send(w)).body;
  expect((await as(w.buyer).get(`/api/class-offers/${offer.id}`)).status).toBe(200);
  await w.other.update({permissions:['class_packages.manage_all','class_payments.review']});
  for(const url of [`/api/class-offers/${offer.id}`,`/api/conversations/${w.conversation.id}/offers`])expect((await as(w.other).get(url)).status).toBe(404);
  expect((await as(w.buyer).post(`/api/conversations/${w.conversation.id}/offers`,{templateVersionId:w.version.id}).set('Idempotency-Key',randomUUID())).status).toBe(404);
  const token=require('jsonwebtoken').sign({id:w.buyer.id,impersonatedBy:w.other.id},process.env.JWT_SECRET);
  expect((await request(app).get(`/api/class-offers/${offer.id}`).set('Authorization',`Bearer ${token}`)).status).toBe(403);
  process.env.FEATURE_CLASS_PACKAGES='0';expect((await as(w.buyer).get(`/api/class-offers/${offer.id}`)).status).toBe(200);expect((await send(w)).body.code).toBe('feature_disabled');
});
test('pausa ventas bloquea nueva oferta; replay sigue siendo seguro, chat e historial continúan',async()=>{
  const w=await packageWorld();const key=randomUUID();expect((await send(w,key)).status).toBe(201);
  await TeacherClassSettings.update({salesPausedAt:new Date()},{where:{userId:w.teacher.id}});
  expect((await send(w)).body.code).toBe('sales_paused');expect((await send(w,key)).status).toBe(200);
  expect((await as(w.buyer).get(`/api/conversations/${w.conversation.id}/messages`)).status).toBe(200);
});
test('cancelar y reemplazar cierran intento pendiente, conservan snapshot y evento idempotente',async()=>{
  const w=await packageWorld();const old=(await send(w)).body;
  const order=await Order.create({offerId:old.id,buyerId:w.buyer.id,amount:9000,currency:'USD',provider:'fake',checkoutRef:'a'.repeat(32)});
  await Offer.update({status:'checkout_pending'},{where:{id:old.id}});
  const key=randomUUID();const replace=()=>as(w.teacher).post(`/api/class-offers/${old.id}/replace`,{templateVersionId:w.version.id}).set('Idempotency-Key',key);
  const r=await replace();expect(r.status).toBe(201);expect(r.body.replacesOfferId).toBe(old.id);expect((await replace()).status).toBe(200);
  expect((await Offer.findByPk(old.id)).status).toBe('replaced');expect((await order.reload()).status).toBe('failed');
  expect((await as(w.buyer).post(`/api/class-offers/${r.body.id}/cancel`,{reason:'x'})).status).toBe(404);
  for(let i=0;i<2;i++) expect((await as(w.teacher).post(`/api/class-offers/${r.body.id}/cancel`,{reason:'Corrijo condiciones'})).status).toBe(200);
  expect(await Message.count({where:{offerId:r.body.id,eventCode:'package_offer_cancelled'}})).toBe(1);
});
test('job vencimiento repetido cierra oferta e intento una vez; lectura aplica límite exacto',async()=>{
  const w=await packageWorld();const offer=(await send(w)).body;
  await Offer.update({expiresAt:new Date(Date.now()-1000),status:'checkout_pending'},{where:{id:offer.id}});
  const order=await Order.create({offerId:offer.id,buyerId:w.buyer.id,amount:9000,currency:'USD',provider:'fake',checkoutRef:'b'.repeat(32)});
  expect((await as(w.buyer).get(`/api/class-offers/${offer.id}`)).body.status).toBe('expired');
  await Promise.all([offers.expire({aggregateId:offer.id}),offers.expire({aggregateId:offer.id})]);
  expect((await order.reload()).status).toBe('failed');expect((await Offer.findByPk(offer.id)).status).toBe('expired');
  expect(await Message.count({where:{offerId:offer.id,eventCode:'package_offer_expired'}})).toBe(1);
});
test('rechaza datos de cliente, clave inválida, grupo incompleto y catálogo viejo',async()=>{
  const w=await packageWorld();expect((await send(w,'bad/key')).status).toBe(400);
  for(const body of [{templateVersionId:w.version.id,amount:1},{templateVersionId:w.version.id,beneficiaryIds:[w.buyer.id,w.other.id]},{templateVersionId:w.version.id,cohortId:1}])expect((await send(w,randomUUID(),body)).status).toBe(400);
  const group=await packageWorld({key:'group2-1x50-total'});expect((await send(group)).body.code).toBe('group_incomplete');
  expect((await send(w,randomUUID(),{templateVersionId:w.version.id-1})).body.code).toBe('version_conflict');
});
