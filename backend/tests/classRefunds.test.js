const {randomUUID}=require('crypto');
const {as,createUser}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const {ClassPolicyVersion:Policy,ClassPackagePurchase:Purchase,ClassPackageOrder:Order,AuditLog,OutboxJob,ClassPackageTemplateVersion:Version}=require('../src/models');
const offers=require('../src/services/classOffers');const checkout=require('../src/services/classCheckout');const refunds=require('../src/services/classRefunds');const credits=require('../src/services/classCredits');const db=require('../src/config/database');
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';process.env.PAYMENTS_FAKE='1';});
afterEach(()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;process.env.PAYMENTS_FAKE='0';});
async function paid(){const w=await packageWorld();const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID());await checkout.start(w.buyer,offer.id,randomUUID());await checkout.completeFake(w.buyer,offer.id);const p=await Purchase.findOne({where:{offerId:offer.id}});const admin=await createUser('student','refund-admin');await admin.update({permissions:['class_payments.review']});return {...w,offer,p,admin};}
const url=w=>`/api/me/class-packages/${w.p.id}`;
async function request(w,type='voluntary',key=randomUUID()){const v=await refunds.ownPreview(w.buyer,w.p.id,type);const body={version:v.version,quote:v.quote,type,reason:'Solicitud ficticia para revisar'};return {r:await as(w.buyer).post(`${url(w)}/refund-requests`,body).set('Idempotency-Key',key),body,key};}
test('P01 nuevas versiones 360h, snapshots independientes y V1 de 336h intacta',async()=>{
 const w=await paid();expect(w.p.snapshot.policy).toMatchObject({refundMode:'full_unused_then_review',refundWindowHours:360});
 expect((await Policy.findOne({where:{version:1}})).rules.refundWindowHours).toBe(336);
 const v=await refunds.ownPreview(w.buyer,w.p.id);expect(Date.parse(v.deadline)-w.p.paidAt).toBe(360*3600000);expect(v.deadlineVerified).toBe(false);
 const original=w.p.snapshot;const {current}=await require('../src/services/classCatalog').newVersion(w.teacher,w.template.id,{...Object.fromEntries(require('../src/services/classCatalog').FIELDS.map(k=>[k,w.version[k]])),priceAmount:9500,version:w.version.version});expect(current.priceAmount).toBe(9500);expect((await w.p.reload()).snapshot).toEqual(original);
});
test('solicitud concurrente/idempotente no devuelve dinero; permisos y cotización vieja protegen el trámite',async()=>{
 const w=await paid();const v=await refunds.ownPreview(w.buyer,w.p.id);const body={version:v.version,quote:v.quote,type:'voluntary',reason:'Solicitud ficticia'};const key=randomUUID();
 const results=await Promise.all([1,2].map(()=>as(w.buyer).post(`${url(w)}/refund-requests`,body).set('Idempotency-Key',key)));expect(results.map(r=>r.status)).toEqual([200,200]);expect(results[0].body.requests).toHaveLength(1);
 expect(await AuditLog.count({where:{action:'refund.requested',entityId:w.p.id}})).toBe(1);expect((await Order.findByPk(w.p.orderId)).refundedAmount).toBe(0);expect((await w.p.reload()).unitsAvailable).toBe(4);
 expect((await as(w.other).get(`${url(w)}/refund-preview`)).status).toBe(404);expect((await as(w.teacher).get('/api/admin/class-refund-requests')).status).toBe(403);
 expect((await as(w.buyer).post(`${url(w)}/refund-requests`,{...body,reason:'Otro motivo'}).set('Idempotency-Key',key)).body.code).toBe('operation_key_conflict');
 expect((await as(w.buyer).post(`${url(w)}/refund-requests`,{...body,quote:'stale'}).set('Idempotency-Key',randomUUID())).body.code).toBe('version_conflict');
});
test('aprobación con motivo no es devolución; confirmación fake concilia total una vez',async()=>{
 const w=await paid();const {r}=await request(w);expect(r.status).toBe(200);expect(r.body.classification).toBe('standard_full_unused');const id=r.body.requests[0].id;
 const approved=await as(w.admin).post(`/api/admin/class-refund-requests/${id}/review`,{action:'approve',reason:'Sin consumo, sin compromisos, autorizado ficticio',quote:r.body.quote});expect(approved.status).toBe(200);expect(approved.body.requests[0].status).toBe('queued');expect((await w.p.reload()).status).toBe('cancelled');expect(w.p.unitsRefunded).toBe(0);expect((await Order.findByPk(w.p.orderId)).refundedAmount).toBe(0);
 for(let i=0;i<2;i++)expect((await as(w.admin).post(`/api/admin/class-payments/${w.p.orderId}/fake-refund-complete`)).status).toBe(200);
 const v=await refunds.ownPreview(w.buyer,w.p.id);expect(v.requests[0].status).toBe('confirmed');expect(v.refundedAmount).toBe(9000);expect(await w.p.reload()).toMatchObject({unitsRefunded:4,unitsAvailable:0,unitsConsumed:0});
});
test('reservas no cuentan como uso pero bloquean aprobación hasta resolución explícita',async()=>{
 const w=await paid();await db.transaction(transaction=>credits.apply({purchaseId:w.p.id,operation:'reserve',units:1,operationKey:`reserve:refund-test:${w.p.id}`},{transaction}));const {r}=await request(w);expect(r.body).toMatchObject({classification:'standard_full_unused',reservationsPending:true,consumed:0,reserved:1});
 const id=r.body.requests[0].id;expect((await as(w.admin).post(`/api/admin/class-refund-requests/${id}/review`,{action:'approve',reason:'No debería aprobar sin resolver',quote:r.body.quote})).body.code).toBe('sessions_pending_resolution');
 expect(await OutboxJob.count({where:{topic:'payment.refund',aggregateId:w.p.orderId}})).toBe(0);
});
test('uso, plazo y falta de servicio siempre a revisión individual; no rechaza ni prorratea automáticamente',async()=>{
 const w=await paid();await db.transaction(async transaction=>{await credits.apply({purchaseId:w.p.id,operation:'reserve',units:1,operationKey:`reserve:used:${w.p.id}`},{transaction});await credits.apply({purchaseId:w.p.id,operation:'consume',units:1,operationKey:`consume:used:${w.p.id}`},{transaction});});await w.p.reload();
 await w.p.update({paidAt:new Date(Date.now()-800*3600000)});const {r}=await request(w,'service_unavailable');expect(r.status).toBe(200);expect(r.body).toMatchObject({classification:'individual_review',amount:9000,consumed:1});
 const review=await as(w.admin).post(`/api/admin/class-refund-requests/${r.body.requests[0].id}/review`,{action:'approve',reason:'Incumplimiento verificado individualmente, devolución total ficticia',quote:r.body.quote});expect(review.status).toBe(200);await require('../src/services/classPaymentReview').refund({aggregateId:w.p.orderId});expect(await w.p.reload()).toMatchObject({unitsConsumed:1,unitsRefunded:3,unitsGranted:4});
});
test('plazo efectivo verificado solo puede ampliarse, con evidencia auditada, sin tocar snapshot',async()=>{
 const w=await paid();const snapshot=w.p.snapshot;const deadline=new Date(w.p.paidAt.getTime()+720*3600000).toISOString();
 const r=await as(w.admin).post(`/api/admin/class-purchases/${w.p.id}/refund-deadline`,{deadline,reason:'Evidencia sintética de garantía superior, solo prueba'});expect(r.status).toBe(200);expect(r.body).toMatchObject({deadlineVerified:true,deadline});
 expect((await as(w.admin).post(`/api/admin/class-purchases/${w.p.id}/refund-deadline`,{deadline:new Date(w.p.paidAt.getTime()+400*3600000).toISOString(),reason:'No reducir'})).status).toBe(400);expect((await w.p.reload()).snapshot).toEqual(snapshot);
});
test('política histórica no se reinterpreta y eventos manuales conservan seguimiento',async()=>{
 const w=await paid();const old={...w.p.snapshot,policy:{...w.p.snapshot.policy,refundWindowHours:336}};delete old.policy.refundMode;await w.p.update({snapshot:old});const {r}=await request(w);expect(r.body.classification).toBe('individual_review');
 await Order.update({provider:'hotmart'},{where:{id:w.p.orderId}});const v=await refunds.ownPreview(w.buyer,w.p.id);const id=v.requests[0].id;
 const result=await as(w.admin).post(`/api/admin/class-refund-requests/${id}/review`,{action:'approve',reason:'Revisión histórica individual para trámite manual',quote:v.quote});expect(result.body.requests[0].status).toBe('manual_hotmart');expect(await OutboxJob.count({where:{topic:'payment.refund',aggregateId:w.p.orderId}})).toBe(0);expect((await Order.findByPk(w.p.orderId)).refundedAmount).toBe(0);
 const update=await as(w.admin).post(`/api/admin/class-refund-requests/${id}/review`,{action:'manual_update',reason:'Número de gestión ficticia para seguimiento',quote:result.body.quote});expect(update.body.requests[0].updates).toHaveLength(2);
});
test('grupo de dos solo admite una oferta activa aunque se cambie de comprador',async()=>{
 const w=await packageWorld({key:'group2-1x50-total'});const chat=require('../src/services/chatService');const c2=(await chat.startConversation(w.other,{teacherId:w.teacher.id})).conversation;const c=await require('../src/services/classCohorts').create(w.teacher,{templateVersionId:w.version.id,tentativeStartsAt:new Date(Date.now()+240*3600000).toISOString(),invitedIds:[w.buyer.id,w.other.id]});
 for(const u of [w.buyer,w.other])await require('../src/services/classCohorts').respond(u,c.id,true);
 const body={templateVersionId:w.version.id,cohortId:c.id,beneficiaryIds:[w.buyer.id,w.other.id]};await offers.send(w.teacher,w.conversation.id,body,randomUUID());await expect(offers.send(w.teacher,c2.id,body,randomUUID())).rejects.toMatchObject({code:'group_incomplete'});
});
test('recuperación por capacidad, reintento de fallidos y avisos persistentes con cierre auditado',async()=>{
 const w=await paid();const job=await OutboxJob.create({topic:'review.incomplete_group',aggregateType:'class_cohorts',aggregateId:999,dedupeKey:`review:recovery:${randomUUID()}`,payload:{purchaseIds:[w.p.id]},status:'done',runAt:new Date()});
 expect((await as(w.buyer).get('/api/admin/class-payment-jobs')).status).toBe(403);
 const jobs=(await as(w.admin).get('/api/admin/class-payment-jobs')).body;expect(jobs.find(j=>j.id===Number(job.id))).toMatchObject({status:'attention',purchaseIds:[w.p.id]});
 expect((await as(w.admin).post(`/api/admin/class-payment-jobs/${job.id}/acknowledge`,{reason:'Caso resuelto ficticiamente sin imponer nueva fecha'})).status).toBe(200);expect((await as(w.admin).get('/api/admin/class-payment-jobs')).body.some(j=>j.id===Number(job.id))).toBe(false);
 const failed=await OutboxJob.create({topic:'email.purchase_confirmed',aggregateType:'class_package_purchases',aggregateId:w.p.id,dedupeKey:`email:retry:${randomUUID()}`,status:'failed',attempts:8,runAt:new Date()});
 expect((await as(w.admin).post(`/api/admin/class-payment-jobs/${failed.id}/retry`,{})).status).toBe(400);
 expect((await as(w.admin).post(`/api/admin/class-payment-jobs/${failed.id}/retry`,{reason:'Transporte ficticio recuperado'})).status).toBe(200);expect(await failed.reload()).toMatchObject({status:'pending',attempts:0});
 expect((await as(w.buyer).get(`/api/admin/class-purchases/${w.p.id}`)).status).toBe(403);expect((await as(w.admin).get(`/api/admin/class-purchases/${w.p.id}`)).status).toBe(200);
});
test('grupo incompleto pagado bloquea nuevas reservas, conserva dinero y saldo hasta la resolución humana',async()=>{
 const w=await packageWorld({key:'group3-1x50-seat'});const third=await createUser('student','refund-group-third');const chat=require('../src/services/chatService');for(const u of [w.other,third])await chat.startConversation(u,{teacherId:w.teacher.id});const cohorts=require('../src/services/classCohorts');const c=await cohorts.create(w.teacher,{templateVersionId:w.version.id,tentativeStartsAt:new Date(Date.now()+240*3600000).toISOString(),invitedIds:[w.buyer.id,w.other.id,third.id]});for(const u of [w.buyer,w.other,third])await cohorts.respond(u,c.id,true);
 const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id,cohortId:c.id,beneficiaryIds:[w.buyer.id]},randomUUID());await checkout.start(w.buyer,offer.id,randomUUID());await checkout.completeFake(w.buyer,offer.id);const p=await Purchase.findOne({where:{offerId:offer.id}});
 await require('../src/models').ClassCohort.update({formingDeadlineAt:new Date(Date.now()-1000)},{where:{id:c.id}});await cohorts.deadline({aggregateId:c.id});await cohorts.deadline({aggregateId:c.id});
 expect(await p.reload()).toMatchObject({status:'cancelled',unitsAvailable:1,unitsRefunded:0});expect((await Order.findByPk(p.orderId)).refundedAmount).toBe(0);expect(await AuditLog.count({where:{action:'cohort.purchase_blocked',entityId:p.id}})).toBe(1);
 await expect(db.transaction(transaction=>credits.apply({purchaseId:p.id,operation:'reserve',units:1,operationKey:`reserve:after-group:${p.id}`},{transaction}))).rejects.toMatchObject({code:'package_not_active'});
 const v=await refunds.ownPreview(w.buyer,p.id,'group_incomplete');expect(v.classification).toBe('individual_review');expect(v.amount).toBe(1500);
});
test('demora interna de revisión no quita el plazo de una solicitud presentada en término',async()=>{
 const w=await paid();const {r}=await request(w);expect(r.body.classification).toBe('standard_full_unused');const original=w.p.snapshot;
 const delayed=await refunds.preview(w.p,{now:new Date(Date.parse(r.body.deadline)+48*3600000)});expect(delayed.classification).toBe('standard_full_unused');expect(delayed.requests).toHaveLength(1);expect((await w.p.reload()).snapshot).toEqual(original);
});
