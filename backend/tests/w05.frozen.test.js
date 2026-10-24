// W05 (#45): órdenes congeladas por un reembolso que no cuadra. confirm_refund concilia el reembolso, unfreeze descarta la
// falsa alarma. Pagos y eventos ficticios (PAYMENTS_FAKE=1); nada de dinero real.
const {randomUUID}=require('crypto');
const {as,createUser}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const {ClassOffer:Offer,ClassPackageOrder:Order,ClassPackagePurchase:Purchase,ClassCreditLedger:Ledger,PaymentProviderEvent:Event,OutboxJob,Message,AuditLog}=require('../src/models');
const db=require('../src/config/database');
const offers=require('../src/services/classOffers');
const checkout=require('../src/services/classCheckout');
const events=require('../src/services/classPayments');
const credits=require('../src/services/classCredits');
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';process.env.PAYMENTS_FAKE='1';});
afterEach(()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;process.env.PAYMENTS_FAKE='0';});
const apply=body=>events.handleEvent(body,{provider:'fake'});
// Mundo con la compra ya acreditada (4 créditos) y el body aprobado, listo para derivar eventos de reembolso.
async function paid(){
  const w=await packageWorld();const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID());
  const r=await as(w.buyer).post(`/api/class-offers/${offer.id}/checkout`,{}).set('Idempotency-Key',randomUUID());expect(r.status).toBe(200);
  const order=await Order.findByPk(r.body.order.id);const body=checkout.fakeBody(order,offer);await apply(body);
  const purchase=await Purchase.findOne({where:{orderId:order.id}});
  const admin=await createUser('student','w05-frozen');await admin.update({permissions:['class_payments.review']});
  return {...w,offer,order,body,purchase,admin};
}
const move=(p,operation,units)=>db.transaction(transaction=>credits.apply({purchaseId:p.id,operation,units,operationKey:`${operation}:frozen:${p.id}:${randomUUID()}`},{transaction}));
function refundEvent(body,reason){
  const e=JSON.parse(JSON.stringify(body));e.id=randomUUID();e.event='PURCHASE_REFUNDED';e.data.purchase.status='REFUNDED';
  if(reason==='refund_mapping_mismatch')e.data.product.id='other-product';
  else if(reason==='refund_amount_review')e.data.purchase.price.value=1;
  else{e.event='PURCHASE_APPROVED';e.data.purchase.status='PARTIALLY_REFUNDED';}
  return e;
}
async function freeze(w,reason){
  const result=await apply(refundEvent(w.body,reason));expect(result.needsReview).toBe(true);
  await w.order.reload();await w.purchase.reload();expect(w.order).toMatchObject({status:'paid_needs_review',reviewReason:reason});
  return result;
}
const resolve=(w,body)=>as(w.admin).post(`/api/admin/class-payments/${w.order.id}/resolve`,body);
const REASONS=['refund_mapping_mismatch','refund_amount_review','partial_refund_pending_validation'];

test.each(REASONS)('congelar (%s) guarda el estado previo; confirm_refund total retira lo disponible y deja consumidos intactos',async reason=>{
  const w=await paid();await move(w.purchase,'reserve',1);await move(w.purchase,'consume',1);
  await freeze(w,reason);expect(w.purchase).toMatchObject({status:'cancelled',frozenFromStatus:'active',unitsAvailable:3,unitsConsumed:1});
  expect(await Event.count({where:{orderId:w.order.id,outcome:'needs_review'}})).toBe(1);
  const r=await resolve(w,{action:'confirm_refund',reason:'Reembolso visto en Hotmart ficticio'});
  expect(r.status).toBe(200);expect(r.body).toMatchObject({resolved:true,order:{status:'refunded',refundedAmount:9000}});
  await w.order.reload();await w.purchase.reload();
  expect(w.order).toMatchObject({status:'refunded',refundedAmount:9000,reviewResolvedById:w.admin.id});expect(w.order.refundedAt).not.toBeNull();expect(w.order.reviewResolvedAt).not.toBeNull();
  expect(w.purchase).toMatchObject({status:'cancelled',frozenFromStatus:null,unitsGranted:4,unitsAvailable:0,unitsReserved:0,unitsConsumed:1,unitsRefunded:3});expect(w.purchase.cancelledAt).not.toBeNull();
  expect(await Event.count({where:{orderId:w.order.id,outcome:'needs_review'}})).toBe(0);
  expect(await Ledger.count({where:{purchaseId:w.purchase.id,operation:'refund'}})).toBe(1);
  expect(await Message.count({where:{offerId:w.offer.id,eventCode:'package_payment_refunded'}})).toBe(1);
  const audit=await AuditLog.findAll({where:{entityId:w.order.id,action:'payment.review'}});expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({actorId:w.admin.id,reason:'Reembolso visto en Hotmart ficticio',data:{action:'confirm_refund',refundedAmount:9000,reviewReason:reason}});
});
test('confirm_refund con importe menor deja la orden parcialmente reembolsada',async()=>{
  const w=await paid();await freeze(w,'partial_refund_pending_validation');
  const r=await resolve(w,{action:'confirm_refund',refundedAmount:3000,reason:'Parcial ficticio'});
  expect(r.status).toBe(200);expect(r.body.order).toMatchObject({status:'partially_refunded',refundedAmount:3000});
  await w.purchase.reload();expect(w.purchase).toMatchObject({status:'cancelled',unitsAvailable:0,unitsRefunded:4});
  expect(await AuditLog.findOne({where:{entityId:w.order.id,action:'payment.review'}})).toMatchObject({data:{action:'confirm_refund',refundedAmount:3000,reviewReason:'partial_refund_pending_validation'}});
});
test('confirm_refund con reservas encola la revisión humana una sola vez y es idempotente',async()=>{
  const w=await paid();await move(w.purchase,'reserve',2);
  await freeze(w,'refund_amount_review');expect(await OutboxJob.count({where:{topic:'review.refunded_with_reservations',aggregateId:w.purchase.id}})).toBe(1);
  const body={action:'confirm_refund',reason:'Reembolso ficticio'};
  expect((await resolve(w,body)).status).toBe(200);
  const again=await resolve(w,body);expect(again.status).toBe(200);expect(again.body.resolved).toBe(true);
  await w.purchase.reload();expect(w.purchase).toMatchObject({unitsAvailable:0,unitsReserved:2,unitsRefunded:2});
  expect(await OutboxJob.count({where:{topic:'review.refunded_with_reservations',aggregateId:w.purchase.id}})).toBe(1);
  expect(await Ledger.count({where:{purchaseId:w.purchase.id,operation:'refund'}})).toBe(1);
  expect(await AuditLog.count({where:{entityId:w.order.id,action:'payment.review'}})).toBe(1);
  const concurrent=await Promise.all([resolve(w,body),resolve(w,body)]);expect(concurrent.map(r=>r.status)).toEqual([200,200]);
  expect(await Ledger.count({where:{purchaseId:w.purchase.id,operation:'refund'}})).toBe(1);
});
test('confirm_refund: importe inválido o fuera de rango, y refundedAmount solo con confirm_refund',async()=>{
  const w=await paid();await freeze(w,'refund_mapping_mismatch');
  for(const refundedAmount of [0,-5,9001,1.5,'3000',null])expect((await resolve(w,{action:'confirm_refund',refundedAmount,reason:'x'})).status).toBe(400);
  expect((await resolve(w,{action:'unfreeze',refundedAmount:3000,reason:'x'})).status).toBe(400);
  expect((await resolve(w,{action:'credit',refundedAmount:3000,reason:'x'})).status).toBe(400);
  expect((await resolve(w,{action:'confirm_refund',reason:'x',extra:1})).status).toBe(400);
  expect((await w.order.reload()).status).toBe('paid_needs_review');expect(await Ledger.count({where:{purchaseId:w.purchase.id,operation:'refund'}})).toBe(0);
});
test('confirm_refund y unfreeze sobre órdenes no congeladas responden 409',async()=>{
  const w=await paid();
  expect((await resolve(w,{action:'confirm_refund',reason:'x'})).body.code).toBe('offer_not_payable');
  expect((await resolve(w,{action:'unfreeze',reason:'x'})).body.code).toBe('payment_review_required');
  // En revisión por otro motivo (precio): tampoco aplica.
  await w.order.update({status:'paid_needs_review',reviewReason:'price_mismatch'});
  expect((await resolve(w,{action:'confirm_refund',reason:'x'})).body.code).toBe('offer_not_payable');
  expect((await resolve(w,{action:'unfreeze',reason:'x'})).body.code).toBe('payment_review_required');
  expect((await w.purchase.reload()).status).toBe('active');
});
test('permisos: confirm_refund y unfreeze exigen class_payments.review',async()=>{
  const w=await paid();await freeze(w,'refund_amount_review');
  for(const action of ['confirm_refund','unfreeze'])expect((await as(w.teacher).post(`/api/admin/class-payments/${w.order.id}/resolve`,{action,reason:'x'})).status).toBe(403);
});
test('unfreeze desde active restaura el estado y el saldo vuelve a ser usable',async()=>{
  const w=await paid();await freeze(w,'refund_mapping_mismatch');
  const r=await resolve(w,{action:'unfreeze',reason:'Falsa alarma ficticia'});expect(r.status).toBe(200);expect(r.body).toMatchObject({resolved:true,order:{status:'paid',reviewReason:null}});
  await w.order.reload();await w.purchase.reload();
  expect(w.order).toMatchObject({status:'paid',reviewReason:null,reviewResolvedById:w.admin.id});expect(w.order.reviewResolvedAt).not.toBeNull();
  expect(w.purchase).toMatchObject({status:'active',cancelledAt:null,frozenFromStatus:null,unitsAvailable:4,unitsRefunded:0});
  expect(await Event.count({where:{orderId:w.order.id,outcome:'needs_review'}})).toBe(0);expect(await Event.count({where:{orderId:w.order.id,outcome:'ignored'}})).toBeGreaterThan(0);
  expect(await AuditLog.findOne({where:{entityId:w.order.id,action:'payment.review'}})).toMatchObject({data:{action:'unfreeze',reviewReason:'refund_mapping_mismatch',restoredStatus:'active'}});
  await move(w.purchase,'reserve',1);expect((await w.purchase.reload())).toMatchObject({unitsAvailable:3,unitsReserved:1});
  expect((await resolve(w,{action:'unfreeze',reason:'otra vez'})).body.code).toBe('payment_review_required');
  expect(await Ledger.count({where:{purchaseId:w.purchase.id,operation:'refund'}})).toBe(0);
});
test('unfreeze desde paused restaura la pausa; un reembolso posterior que cuadra sigue funcionando',async()=>{
  const w=await paid();
  await w.purchase.update({status:'paused',pausedAt:new Date(),pauseCount:1,snapshot:{...w.purchase.snapshot,policy:{...w.purchase.snapshot.policy,maxPauses:1,maxPauseHours:168}}});
  await freeze(w,'partial_refund_pending_validation');expect(w.purchase).toMatchObject({status:'cancelled',frozenFromStatus:'paused'});
  expect((await resolve(w,{action:'unfreeze',reason:'Falsa alarma ficticia'})).status).toBe(200);
  expect(await w.purchase.reload()).toMatchObject({status:'paused',frozenFromStatus:null,cancelledAt:null,unitsAvailable:4});
  const good=JSON.parse(JSON.stringify(w.body));good.id=randomUUID();good.event='PURCHASE_REFUNDED';good.data.purchase.status='REFUNDED';
  await apply(good);expect(await w.order.reload()).toMatchObject({status:'refunded',refundedAmount:9000});
  expect(await w.purchase.reload()).toMatchObject({status:'cancelled',frozenFromStatus:null,unitsAvailable:0,unitsRefunded:4});
});
test('unfreeze de una compra que venció mientras estaba congelada la deja expirada por el camino normal',async()=>{
  const w=await paid();await freeze(w,'refund_amount_review');
  await w.purchase.update({expiresAt:new Date(Date.now()-60000)});
  expect((await resolve(w,{action:'unfreeze',reason:'Falsa alarma ficticia'})).status).toBe(200);
  expect(await w.purchase.reload()).toMatchObject({status:'expired',frozenFromStatus:null,unitsAvailable:0,unitsExpired:4});
  expect(await Message.count({where:{offerId:w.offer.id,eventCode:'package_expired'}})).toBe(1);
});
test('unfreeze sin estado previo guardado (congelada antes de la migración) responde 409 y no cambia nada',async()=>{
  const w=await paid();await freeze(w,'refund_amount_review');await w.purchase.update({frozenFromStatus:null});
  const r=await resolve(w,{action:'unfreeze',reason:'x'});expect(r.status).toBe(409);expect(r.body.code).toBe('payment_review_required');
  expect(await w.order.reload()).toMatchObject({status:'paid_needs_review'});expect(await w.purchase.reload()).toMatchObject({status:'cancelled'});
  // Sigue disponible la conciliación del reembolso.
  expect((await resolve(w,{action:'confirm_refund',reason:'Reembolso ficticio'})).status).toBe(200);
});
test('un segundo evento de congelamiento no pisa el estado previo',async()=>{
  const w=await paid();await freeze(w,'refund_mapping_mismatch');await freeze(w,'partial_refund_pending_validation');
  expect(w.purchase.frozenFromStatus).toBe('active');
});
test('el listado de pagos expone el estado de la compra, lo congelado y los saldos',async()=>{
  const w=await paid();await move(w.purchase,'reserve',1);await freeze(w,'refund_amount_review');
  const r=await as(w.admin).get('/api/admin/class-payments');const item=r.body.items.find(i=>i.id===w.order.id);
  expect(item).toMatchObject({status:'paid_needs_review',reviewReason:'refund_amount_review',purchaseStatus:'cancelled',frozenFromStatus:'active',unitsAvailable:3,unitsReserved:1,unitsConsumed:0});
});
test('regresión: el reembolso que cuadra por webhook sigue igual',async()=>{
  const w=await paid();await move(w.purchase,'reserve',1);await move(w.purchase,'consume',1);
  const good=JSON.parse(JSON.stringify(w.body));good.id=randomUUID();good.event='PURCHASE_REFUNDED';good.data.purchase.status='REFUNDED';
  expect((await apply(good)).handled).toBe(true);expect((await apply(good)).replayed).toBe(true);
  expect(await w.order.reload()).toMatchObject({status:'refunded',refundedAmount:9000});
  expect(await w.purchase.reload()).toMatchObject({status:'cancelled',frozenFromStatus:null,unitsAvailable:0,unitsConsumed:1,unitsRefunded:3});
  expect(await Ledger.count({where:{purchaseId:w.purchase.id,operation:'refund'}})).toBe(1);
  expect((await Offer.findByPk(w.offer.id)).status).toBe('paid');
});
