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
  const listed=(await as(w.teacher).get(`/api/teacher/class-purchases?studentId=${w.buyer.id}`)).body.find(p=>p.id===w.p.id);
  expect(listed.buyerName).toBe(w.buyer.name);expect(JSON.stringify(listed)).not.toContain(w.buyer.email);expect(listed.buyer).toBeUndefined();
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
test('D3-DIN-01: un ajuste no supera el tope y un valor desbordado no llega a la base',async()=>{
  const w=await paid();const admin=await createUser('student','credits-cap');await admin.update({permissions:['class_credits.adjust','class_credits.adjust_any']});const url=`/api/admin/class-purchases/${w.p.id}/adjustments`;
  const body={units:purchases.MAX_ADJUST_UNITS+1,direction:'add',reason:'Corrección ficticia'};
  const high=await as(admin).post(url,body).set('Idempotency-Key',randomUUID());expect(high.status).toBe(400);expect(high.body.code).toBe('adjust_units_too_high');expect(high.body.params).toEqual({max:purchases.MAX_ADJUST_UNITS});
  expect((await as(admin).post(url,{...body,units:2147483647}).set('Idempotency-Key',randomUUID())).body.code).toBe('adjust_units_too_high');
  expect((await as(admin).post(url,{...body,units:99999999999}).set('Idempotency-Key',randomUUID())).body.code).toBe('adjust_units_too_high');
  expect((await as(admin).post(url,{...body,units:purchases.MAX_ADJUST_UNITS}).set('Idempotency-Key',randomUUID())).status).toBe(200);
  expect(await Ledger.count({where:{purchaseId:w.p.id,operation:'adjust'}})).toBe(1);
});
test('D3-DIN-03: no se suman créditos a una compra cancelada, pausada o vencida; restar sigue permitido',async()=>{
  const w=await paid();const admin=await createUser('student','credits-state');await admin.update({permissions:['class_credits.adjust','class_credits.adjust_any']});const url=`/api/admin/class-purchases/${w.p.id}/adjustments`;
  const add=()=>as(admin).post(url,{units:1,direction:'add',reason:'Corrección ficticia'}).set('Idempotency-Key',randomUUID());
  for(const status of ['paused','cancelled','expired']){
    await w.p.reload();await w.p.update({status});const r=await add();expect([status,r.status,r.body.code]).toEqual([status,409,'package_not_active']);
  }
  expect(await Ledger.count({where:{purchaseId:w.p.id,operation:'adjust'}})).toBe(0);
  await w.p.reload();await w.p.update({status:'paused'});
  const remove=await as(admin).post(url,{units:1,direction:'remove',reason:'Corrección ficticia'}).set('Idempotency-Key',randomUUID());expect(remove.status).toBe(200);expect(remove.body.balance.available).toBe(3);
  await w.p.reload();await w.p.update({status:'active'});expect((await add()).status).toBe(200);
});
test('D3-DIN-04/09: la compra lleva el saldo ajustado y el estado del reembolso, sin motivos internos',async()=>{
  const w=await paid();const admin=await createUser('student','credits-view');await admin.update({permissions:['class_credits.adjust','class_credits.adjust_any','class_payments.review']});const url=`/api/admin/class-purchases/${w.p.id}/adjustments`;
  expect((await as(admin).post(url,{units:2,direction:'add',reason:'Nota interna de ajuste'}).set('Idempotency-Key',randomUUID())).status).toBe(200);
  expect((await as(admin).post(url,{units:1,direction:'remove',reason:'Otra nota interna'}).set('Idempotency-Key',randomUUID())).status).toBe(200);
  const own=(await as(w.buyer).get('/api/me/class-packages')).body.find(p=>p.id===w.p.id);expect(own).toMatchObject({adjustedUnits:1,refund:null,balance:{granted:5,available:5}});
  const detail=(await as(w.buyer).get(`/api/me/class-packages/${w.p.id}`)).body;expect(detail.adjustedUnits).toBe(1);expect(detail.ledger.filter(e=>e.operation==='adjust').map(e=>[e.fromBucket,e.toBucket])).toEqual([['none','available'],['available','none']]);expect(JSON.stringify(detail)).not.toContain('Nota interna de ajuste');expect(detail.ledger.filter(e=>e.operation==='adjust').every(e=>e.reason===null&&e.actorId===null)).toBe(true);
  const adminView=(await as(admin).get(`/api/admin/class-purchases/${w.p.id}`)).body;expect(adminView).toMatchObject({buyerName:w.buyer.name,status:'active'});expect(adminView.adjustments.map(a=>[a.direction,a.units])).toEqual([['remove',1],['add',2]]);
  const refunds=require('../src/services/classRefunds');const v=await refunds.ownPreview(w.buyer,w.p.id);
  const sent=await as(w.buyer).post(`${url.replace('/admin/class-purchases/','/me/class-packages/').replace('/adjustments','')}/refund-requests`,{version:v.version,quote:v.quote,type:'voluntary',reason:'Solicitud ficticia'}).set('Idempotency-Key',randomUUID());expect(sent.status).toBe(200);
  expect((await as(w.buyer).get('/api/me/class-packages')).body.find(p=>p.id===w.p.id).refund).toMatchObject({status:'requested',amount:9000,currency:'USD'});
  expect((await as(w.teacher).get(`/api/teacher/class-purchases?studentId=${w.buyer.id}`)).body.find(p=>p.id===w.p.id).refund.status).toBe('requested');
});
test('D3-DIN-15: el rechazo por sesiones pendientes lista las sesiones que hay que resolver',async()=>{
  const w=await paid();const startsAt=new Date(Date.now()+86400000);
  const session=await Session.create({teacherId:w.teacher.id,kind:'individual',status:'proposed',version:1,startsAt,endsAt:new Date(startsAt.getTime()+3600000),timeZone:'UTC',localStart:'2026-11-01T10:00',utcOffset:'+00:00',disambiguation:'none',minutes:50});
  await Participant.create({sessionId:session.id,userId:w.buyer.id,purchaseId:w.p.id,status:'invited'});
  const r=await change(w,'pause',{version:w.p.version});expect(r.status).toBe(409);expect(r.body.code).toBe('sessions_pending_resolution');
  expect(r.body.params).toMatchObject({count:1,sessions:[{id:Number(session.id),status:'proposed'}]});expect(Date.parse(r.body.params.sessions[0].startsAt)).toBe(Math.floor(startsAt.getTime()/1000)*1000);
});
test('D3-DIN-18: un paquete vencido sigue vencido al confirmarse su reembolso',async()=>{
  const w=await paid();const now=new Date();await w.p.update({expiresAt:new Date(now-1000)});await purchases.settle(w.p.id);expect((await w.p.reload()).status).toBe('expired');
  const order=await require('../src/models').ClassPackageOrder.findByPk(w.p.orderId);const payments=require('../src/services/classPayments');
  await db.transaction(async transaction=>payments.applyRefund?payments.applyRefund(order,await Offer.findByPk(w.offer.id,{transaction}),{refundedAmount:order.amount,operationKey:`refund:order:${order.id}:t`},transaction):null);
  expect((await w.p.reload()).status).toBe('expired');
});
