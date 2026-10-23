const {randomUUID}=require('crypto');
const request=require('supertest');
const {app,as,createUser}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const {ClassOffer:Offer,ClassPackageOrder:Order,ClassPackagePurchase:Purchase,ClassPackageBeneficiary:Beneficiary,ClassCreditLedger:Ledger,PaymentProviderEvent:Event,Message,Enrollment,User,AuditLog}=require('../src/models');
const offers=require('../src/services/classOffers');
const checkout=require('../src/services/classCheckout');
const events=require('../src/services/classPayments');
const review=require('../src/services/classPaymentReview');
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';process.env.PAYMENTS_FAKE='1';});
afterEach(()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;process.env.PAYMENTS_FAKE='0';delete process.env.HOTMART_HOTTOK;});
async function world(){const w=await packageWorld();const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID());return {...w,offer};}
const start=(w,key=randomUUID(),body={})=>as(w.buyer).post(`/api/class-offers/${w.offer.id}/checkout`,body).set('Idempotency-Key',key);
async function pending(w){const r=await start(w);expect(r.status).toBe(200);const order=await Order.findByPk(r.body.order.id);return {order,body:checkout.fakeBody(order,w.offer)};}
const apply=body=>events.handleEvent(body,{provider:'fake'});
test('doble clic y dos claves reutilizan un solo intento; redirect no acredita; precio del servidor',async()=>{
  const w=await world();const replies=await Promise.all([start(w,randomUUID(),{amount:1,currency:'ARS'}),start(w)]);
  expect(replies.map(r=>r.status)).toEqual([200,200]);expect(replies[0].body.order.id).toBe(replies[1].body.order.id);
  expect(replies[0].body.order).toMatchObject({amount:9000,currency:'USD',provider:'fake',status:'pending'});
  expect(replies[0].body.checkoutUrl).toContain(`/class-offers/${w.offer.id}`);
  expect(await Order.count({where:{offerId:w.offer.id,status:'pending'}})).toBe(1);
  expect((await as(w.buyer).get(`/api/class-offers/${w.offer.id}/checkout`)).body.order.status).toBe('pending');
  expect(await Purchase.count({where:{offerId:w.offer.id}})).toBe(0);
  for(const user of [w.teacher,w.other])expect((await as(user).get(`/api/class-offers/${w.offer.id}/checkout`)).status).toBe(404);
});
test('token Hotmart no habilita paquetes reales sin verificar cuenta, formato, garantía y mapeo',async()=>{
  const w=await world();process.env.PAYMENTS_FAKE='0';
  for(const token of ['', 'fake-secret-only-test']){process.env.HOTMART_HOTTOK=token;expect((await start(w)).body.code).toBe('package_provider_verification_required');}
  expect(await Order.count({where:{offerId:w.offer.id}})).toBe(0);
  expect((await request(app).patch('/api/teacher/class-settings').set('Authorization',`Bearer ${w.teacher.token}`).send({salesPaused:false})).body.code).toBe('package_provider_verification_required');
});
test('AC02/03: fake-complete y eventos concurrentes producen una compra, 4 créditos y cero inscripciones de curso',async()=>{
  const w=await world();const {order,body}=await pending(w);const enrollments=await Enrollment.count();
  const results=await Promise.all([apply(body),apply(body),as(w.buyer).post(`/api/class-offers/${w.offer.id}/checkout/fake-complete`)]);
  expect(results[2].status).toBe(200);const p=await Purchase.findOne({where:{offerId:w.offer.id}});
  expect(p).toMatchObject({buyerId:w.buyer.id,unitsGranted:4,unitsAvailable:4,unitsReserved:0});
  expect(p.expiresAt-p.paidAt).toBe(2160*3600000);expect(p.snapshot).toEqual((await Offer.findByPk(w.offer.id)).snapshot);
  expect(await Purchase.count({where:{orderId:order.id}})).toBe(1);expect(await Ledger.count({where:{purchaseId:p.id,operation:'grant'}})).toBe(1);expect(await Beneficiary.count({where:{purchaseId:p.id,userId:w.buyer.id}})).toBe(1);
  expect(await Message.count({where:{offerId:w.offer.id,eventCode:'package_payment_confirmed'}})).toBe(1);expect(await Enrollment.count()).toBe(enrollments);
  const complete={...body,id:randomUUID(),event:'PURCHASE_COMPLETE'};await apply(complete);expect(await Ledger.count({where:{purchaseId:p.id}})).toBe(1);
});
test('identidad desde oferta aunque cambie email; payload saneado sin hottok/documentos',async()=>{
  const w=await world();const {order,body}=await pending(w);body.hottok='secret';body.data.buyer={email:'different@fake.invalid',document:'sensitive-document'};
  const users=await User.count();await apply(body);const p=await Purchase.findOne({where:{orderId:order.id}});expect(p.buyerId).toBe(w.buyer.id);expect(await User.count()).toBe(users);
  expect((await order.reload()).buyerEmailReported).toBe('different@fake.invalid');expect(await AuditLog.count({where:{entityId:order.id,action:'payment.email_mismatch'}})).toBe(1);
  const e=await Event.findOne({where:{provider:'fake',eventKey:body.id}});expect(JSON.stringify(e.payload)).not.toMatch(/secret|sensitive-document|different@/);
});
test('pago tardío se registra en revisión; revisión autorizada acredita una sola vez con auditoría',async()=>{
  const w=await world();const {order,body}=await pending(w);await Offer.update({expiresAt:new Date(Date.now()-1000)},{where:{id:w.offer.id}});await offers.expire({aggregateId:w.offer.id});
  expect((await apply(body)).needsReview).toBe(true);expect((await order.reload()).status).toBe('paid_needs_review');expect(await Purchase.count({where:{orderId:order.id}})).toBe(0);
  const url=`/api/admin/class-payments/${order.id}/resolve`;expect((await as(w.teacher).post(url,{action:'credit',reason:'Revisión ficticia'})).status).toBe(403);
  const admin=await createUser('student','w05-review');await admin.update({permissions:['class_payments.review']});
  const r=await as(admin).post(url,{action:'credit',reason:'Confirmo cumplimiento ficticio'});expect(r.status).toBe(200);expect(r.body.order.status).toBe('paid');
  expect((await as(admin).post(url,{action:'credit',reason:'Reintento ficticio'})).status).toBe(200);
  const p=await Purchase.findOne({where:{orderId:order.id}});expect(await Ledger.count({where:{purchaseId:p.id}})).toBe(1);expect(await AuditLog.count({where:{entityId:order.id,action:'payment.review'}})).toBe(1);
});
test.each(['price','product','code'])('datos del proveedor incompatibles (%s) quedan en revisión sin grant',async kind=>{
  const w=await world();const {order,body}=await pending(w);
  if(kind==='price')body.data.purchase.price.value=1;else if(kind==='product')body.data.product.id='other-product';else body.data.purchase.offer.code='other-code';
  await apply(body);expect((await order.reload()).status).toBe('paid_needs_review');expect(await Purchase.count({where:{orderId:order.id}})).toBe(0);
});
test('reembolso antes de aprobación es terminal y nunca acredita',async()=>{
  const w=await world();const {order,body}=await pending(w);await apply({...body,id:randomUUID(),event:'PURCHASE_REFUNDED'});await apply(body);
  expect((await order.reload()).status).toBe('refunded');expect(await Purchase.count({where:{orderId:order.id}})).toBe(0);
});
test('reembolso confirmado mueve disponibles, conserva consumidos/reservados y no se duplica',async()=>{
  const w=await world();const {order,body}=await pending(w);await apply(body);const p=await Purchase.findOne({where:{orderId:order.id}});
  const credits=require('../src/services/classCredits');const db=require('../src/config/database');
  await db.transaction(async transaction=>{await credits.apply({purchaseId:p.id,operation:'reserve',units:2,operationKey:`reserve:test:${p.id}`},{transaction});await credits.apply({purchaseId:p.id,operation:'consume',units:1,operationKey:`consume:test:${p.id}`},{transaction});});
  const refunded={...body,id:randomUUID(),event:'PURCHASE_REFUNDED'};await Promise.all([apply(refunded),apply(refunded)]);
  expect(await p.reload()).toMatchObject({status:'cancelled',unitsGranted:4,unitsAvailable:0,unitsReserved:1,unitsConsumed:1,unitsRefunded:2});
  expect((await order.reload()).refundedAmount).toBe(9000);expect(await Ledger.count({where:{purchaseId:p.id,operation:'refund'}})).toBe(1);
});
test('referencia ausente no se adivina por email; queda visible como evento en revisión',async()=>{
  const w=await world();const {body}=await pending(w);delete body.data.purchase.origin;await apply(body);
  const e=await Event.findOne({where:{provider:'fake',eventKey:body.id}});expect(e.outcome).toBe('needs_review');expect(e.orderId).toBeNull();expect(await Purchase.count({where:{offerId:w.offer.id}})).toBe(0);
});
test('otra transacción sobre el mismo link no duplica crédito ni pisa el cobro anterior',async()=>{
  const w=await world();const {order,body}=await pending(w);await apply(body);const next=JSON.parse(JSON.stringify(body));next.id=randomUUID();next.data.purchase.transaction='EXTRA-TRANSACTION';expect((await apply(next)).needsReview).toBe(true);
  expect((await order.reload()).providerTransactionId).toBe(body.data.purchase.transaction);expect(await Purchase.count({where:{offerId:w.offer.id}})).toBe(1);
});
test('solicitar devolución no marca reembolsado antes de ejecutar fake/proveedor; P01 no inventa parciales',async()=>{
  const w=await world();const {order,body}=await pending(w);await apply(body);const admin=await createUser('student','w05-refunder');await admin.update({permissions:['class_payments.review']});
  const r=await as(admin).post(`/api/admin/class-payments/${order.id}/resolve`,{action:'refund',reason:'Prueba íntegra ficticia'});expect(r.body.refundRequested).toBe(true);expect((await order.reload()).status).toBe('paid');
  await review.refund({aggregateId:order.id});expect((await order.reload()).status).toBe('refunded');
});
test('dinero de webhook se convierte a unidades menores sin redondear silenciosamente',()=>{
  expect(events.amountOf({value:90,currency_value:'USD'})).toEqual({amount:9000,currency:'USD'});
  expect(events.amountOf({value:1500,currency_value:'JPY'})).toEqual({amount:1500,currency:'JPY'});
  expect(events.amountOf({value:1.001,currency_value:'USD'})).toBeNull();expect(events.amountOf({value:-1,currency_value:'USD'})).toBeNull();
});
test('un pago en revisión bloquea cobrar de nuevo, cancelar o reemplazar hasta resolverlo',async()=>{
  const w=await world();const {body}=await pending(w);body.data.purchase.price.value=1;await apply(body);
  expect((await start(w)).body.code).toBe('offer_not_payable');
  expect((await as(w.teacher).post(`/api/class-offers/${w.offer.id}/cancel`,{reason:'Cambio ficticio'})).body.code).toBe('offer_not_payable');
  expect((await as(w.teacher).post(`/api/class-offers/${w.offer.id}/replace`,{templateVersionId:w.version.id}).set('Idempotency-Key',randomUUID())).body.code).toBe('offer_not_payable');
});
test('renovación manual crea otra oferta/compra y conserva saldo e historial anteriores',async()=>{
  const w=await world();await pending(w);await checkout.completeFake(w.buyer,w.offer.id);const original=await Purchase.findOne({where:{offerId:w.offer.id}});const before=original.toJSON();
  const next=(await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID())).offer;await checkout.start(w.buyer,next.id,randomUUID());
  expect(await Purchase.count({where:{buyerId:w.buyer.id}})).toBe(1);
  await checkout.completeFake(w.buyer,next.id);expect(await Purchase.count({where:{buyerId:w.buyer.id}})).toBe(2);expect((await original.reload()).toJSON()).toEqual(before);
});
test('repetir la clave de un checkout ya conciliado devuelve 200 sin abrir otro intento',async()=>{
  const w=await world();const key=randomUUID();const initial=await start(w,key);await checkout.completeFake(w.buyer,w.offer.id);const again=await start(w,key);expect(again.status).toBe(200);expect(again.body.order.id).toBe(initial.body.order.id);expect(again.body.order.status).toBe('paid');expect(again.body.checkoutUrl).toBeNull();expect(await Order.count({where:{offerId:w.offer.id}})).toBe(1);
});
test('PARTIALLY_REFUNDED no se confunde con aprobación ni prueba capacidad de iniciar parciales',async()=>{
  const w=await world();const {order,body}=await pending(w);body.data.purchase.status='PARTIALLY_REFUNDED';
  const result=await apply(body);expect(result.needsReview).toBe(true);expect((await order.reload()).status).toBe('paid_needs_review');expect(await Purchase.count({where:{orderId:order.id}})).toBe(0);expect((await order.reload()).refundedAmount).toBe(0);
});
test('P2-1: un pago real después de un intento fallido pasa a revisión y se puede acreditar',async()=>{
  const w=await world();const {order,body}=await pending(w);
  await apply({...body,id:randomUUID(),event:'PURCHASE_EXPIRED',data:{...body.data,purchase:{...body.data.purchase,transaction:'FAILED-T1'}}});
  expect((await order.reload()).status).toBe('failed');expect(order.providerTransactionId).toBeNull();
  const paid=JSON.parse(JSON.stringify(body));paid.id=randomUUID();paid.data.purchase.transaction='REAL-T2';
  expect((await apply(paid)).needsReview).toBe(true);expect((await order.reload()).status).toBe('paid_needs_review');expect(order.providerTransactionId).toBe('REAL-T2');
  const admin=await createUser('student','w05-p21');await admin.update({permissions:['class_payments.review']});
  const r=await as(admin).post(`/api/admin/class-payments/${order.id}/resolve`,{action:'credit',reason:'Pago real confirmado ficticio'});expect(r.status).toBe(200);
  expect(await Purchase.count({where:{orderId:order.id}})).toBe(1);
});
test.each(['amount','product'])('P2-2: reembolso con datos que no cuadran (%s) congela la compra y la deja en revisión',async kind=>{
  const w=await world();const {order,body}=await pending(w);await apply(body);const p=await Purchase.findOne({where:{orderId:order.id}});
  const refund={...JSON.parse(JSON.stringify(body)),id:randomUUID(),event:'PURCHASE_REFUNDED'};
  if(kind==='amount')refund.data.purchase.price.value=1;else refund.data.product.id='other-product';
  expect((await apply(refund)).needsReview).toBe(true);
  expect((await order.reload()).status).toBe('paid_needs_review');expect((await p.reload()).status).toBe('cancelled');
  const credits=require('../src/services/classCredits');const db=require('../src/config/database');
  await expect(db.transaction(t=>credits.apply({purchaseId:p.id,operation:'reserve',units:1,operationKey:`reserve:p22:${p.id}`},{transaction:t}))).rejects.toMatchObject({code:'package_not_active'});
});
