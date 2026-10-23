const {randomUUID}=require('crypto');
const {as,createUser}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const {ClassPackagePurchase:Purchase,ClassCreditLedger:Ledger,AuditLog,ClassSession:Session,ClassSessionParticipant:Participant,OutboxJob,ClassOffer:Offer}=require('../src/models');
const offers=require('../src/services/classOffers');
const checkout=require('../src/services/classCheckout');
const purchases=require('../src/services/classPurchases');
const db=require('../src/config/database');
const credits=require('../src/services/classCredits');
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';process.env.PAYMENTS_FAKE='1';});
afterEach(()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;process.env.PAYMENTS_FAKE='0';});
async function paid(){const w=await packageWorld();const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID());await checkout.start(w.buyer,offer.id,randomUUID());await checkout.completeFake(w.buyer,offer.id);const p=await Purchase.findOne({where:{offerId:offer.id}});return {...w,offer,p};}
const change=(w,action,body)=>as(w.buyer).post(`/api/me/class-packages/${w.p.id}/${action}`,body);
test('saldo y ledger visibles solo a comprador/beneficiarios; lectura y compromisos siguen con flag apagado',async()=>{
  const w=await paid();process.env.FEATURE_CLASS_PACKAGES='0';
  const r=await as(w.buyer).get(`/api/me/class-packages/${w.p.id}`);expect(r.status).toBe(200);expect(r.body.balance).toEqual({granted:4,available:4,reserved:0,consumed:0,expired:0,refunded:0});expect(r.body.ledger).toHaveLength(1);
  expect(r.body.snapshot.hotmartCheckoutUrl).toBeUndefined();expect((await as(w.other).get(`/api/me/class-packages/${w.p.id}`)).status).toBe(404);
  expect((await as(w.teacher).get(`/api/teacher/class-purchases?studentId=${w.buyer.id}`)).body.map(p=>p.id)).toContain(w.p.id);
  expect((await change(w,'pause',{version:w.p.version})).status).toBe(200);
});
test('pausa/reanudación extiende vigencia por tiempo real, preserva saldo y no permite otra pausa',async()=>{
  const w=await paid();const expiresAt=w.p.expiresAt;
  const pause=await change(w,'pause',{version:w.p.version});expect(pause.status).toBe(200);expect(pause.body.status).toBe('paused');
  await w.p.reload();const duration=3*3600000+7*60000;const now=require('../src/services/legalDocuments').persistedSecond(new Date());await w.p.update({pausedAt:new Date(now-duration)});
  const resumed=await purchases.change(w.buyer,w.p.id,'resume',{version:w.p.version},{now});const resume={body:resumed};expect(new Date(resume.body.expiresAt)-expiresAt).toBe(duration);expect(resume.body.balance.available).toBe(4);expect(resume.body.pauseCount).toBe(1);
  expect((await change(w,'pause',{version:resume.body.version})).body.code).toBe('package_not_active');
  expect(await Ledger.count({where:{purchaseId:w.p.id}})).toBe(1);
});
test('sesiones futuras y reservas requieren resolución antes de pausar/cancelar',async()=>{
  const w=await paid();const session=await Session.create({teacherId:w.teacher.id,kind:'individual',status:'proposed',version:1,startsAt:new Date(Date.now()+86400000),endsAt:new Date(Date.now()+90000000),timeZone:'UTC',localStart:'2026-11-01T10:00',utcOffset:'+00:00',disambiguation:'none',minutes:50});
  await Participant.create({sessionId:session.id,userId:w.buyer.id,purchaseId:w.p.id,status:'invited'});
  for(const action of ['pause','cancel'])expect((await change(w,action,{version:w.p.version,reason:'Prueba ficticia'})).body.code).toBe('sessions_pending_resolution');
  expect((await w.p.reload()).status).toBe('active');
});
test('reanudación máxima y vencimiento son idempotentes y usan solo el ledger W00',async()=>{
  const w=await paid();await change(w,'pause',{version:w.p.version});await w.p.reload();const now=require('../src/services/legalDocuments').persistedSecond(new Date());
  await w.p.update({pausedAt:new Date(now-721*3600000)});const original=w.p.expiresAt;
  const resumed=await purchases.settle(w.p.id);expect(resumed.status).toBe('active');expect(resumed.expiresAt-original).toBe(720*3600000);
  await w.p.reload();await w.p.update({expiresAt:new Date(now-1000)});
  await Promise.all([purchases.settle(w.p.id),purchases.settle(w.p.id)]);
  expect(await w.p.reload()).toMatchObject({status:'expired',unitsAvailable:0,unitsExpired:4,unitsGranted:4});expect(await Ledger.count({where:{purchaseId:w.p.id,operation:'expire'}})).toBe(1);
});
test('cancelación separa saldo/reembolso; solicitud no marca dinero devuelto',async()=>{
  const w=await paid();const r=await change(w,'cancel',{version:w.p.version,reason:'Cancelar ficticiamente'});expect(r.status).toBe(200);expect(r.body).toMatchObject({status:'cancelled',balance:{available:4,refunded:0}});
  expect((await as(w.buyer).get(`/api/me/class-packages/${w.p.id}/refund-preview`)).body).toMatchObject({amount:9000,refundedAmount:0});expect(await AuditLog.count({where:{action:'purchase.cancelled',entityId:w.p.id}})).toBe(1);
});
test('ajuste autorizado e idempotente no duplica saldo; motivo y versión obligan a revisión explícita',async()=>{
  const w=await paid();const admin=await createUser('student','credits-review');await admin.update({permissions:['class_credits.adjust','class_credits.adjust_any']});const key=randomUUID();const url=`/api/admin/class-purchases/${w.p.id}/adjustments`;
  const body={units:1,direction:'add',reason:'Corrección ficticia autorizada',version:w.p.version};
  expect((await as(w.teacher).post(url,body).set('Idempotency-Key',key)).status).toBe(403);
  const [a,b]=await Promise.all([as(admin).post(url,body).set('Idempotency-Key',key),as(admin).post(url,body).set('Idempotency-Key',key)]);expect([a.status,b.status]).toEqual([200,200]);expect(a.body.balance.available).toBe(5);expect(b.body.balance.available).toBe(5);
  expect(await Ledger.count({where:{purchaseId:w.p.id,operation:'adjust'}})).toBe(1);
  expect((await as(admin).post(url,{...body,units:2}).set('Idempotency-Key',key)).body.code).toBe('operation_key_conflict');
});
test('confirmación de compra por outbox se localiza y un reintento ordinario no duplica correo',async()=>{
  const w=await paid();await w.buyer.update({locale:'es',timeZone:'America/Argentina/Cordoba'});
  const job=await OutboxJob.findOne({where:{topic:'email.purchase_confirmed',aggregateId:w.p.id}});
  const mail=require('../src/services/mailService');mail.clearOutbox();const jobs=require('../src/services/classPackageJobs');
  await jobs.confirmation(job);await jobs.confirmation(job);expect(mail.getOutbox()).toHaveLength(1);expect(mail.getOutbox()[0].subject).toContain('confirmado');expect(mail.getOutbox()[0].text).toContain('America/Argentina/Cordoba');
});
test('P2-3: class_credits.adjust solo alcanza compras propias; otro docente 404, dueño 200, adjust_any 200',async()=>{
  const w=await paid();const url=`/api/admin/class-purchases/${w.p.id}/adjustments`;const body={units:1,direction:'add',reason:'Corrección ficticia'};
  const other=await createUser('teacher','credits-other');await other.update({permissions:['class_credits.adjust']});
  expect((await as(other).post(url,body).set('Idempotency-Key',randomUUID())).status).toBe(404);
  expect((await as(other).get(`/api/admin/class-purchases/${w.p.id}`)).status).toBe(404);
  expect(await Ledger.count({where:{purchaseId:w.p.id,operation:'adjust'}})).toBe(0);
  await w.teacher.update({permissions:['class_credits.adjust']});
  expect((await as(w.teacher).post(url,body).set('Idempotency-Key',randomUUID())).status).toBe(200);
  expect((await as(w.teacher).get(`/api/admin/class-purchases/${w.p.id}`)).status).toBe(200);
  await other.update({permissions:['class_credits.adjust','class_credits.adjust_any']});
  expect((await as(other).post(url,body).set('Idempotency-Key',randomUUID())).status).toBe(200);
});
