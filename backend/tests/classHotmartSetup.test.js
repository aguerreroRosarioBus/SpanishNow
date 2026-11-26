const {randomUUID}=require('node:crypto');
const {as,createUser}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const {ClassPackageProviderVerification:Verification,ClassPackageOrder:Order,ClassPackagePurchase:Purchase,ClassPackageTemplateVersion:Version,AuditLog}=require('../src/models');
const catalog=require('../src/services/classCatalog');
const offers=require('../src/services/classOffers');
const checkout=require('../src/services/classCheckout');
const provider=require('../src/services/classPackageProvider');

const setup='/api/teacher/class-packages/hotmart';
const adminPath='/api/admin/class-provider';
const testEvent={event:'PURCHASE_OUT_OF_SHOPPING_CART'};
const key='hottok-ficticio-paquetes-w22';
const otherKey='hottok-ficticio-otro-docente';
const sharedKey='hottok-ficticio-compartido';
const evidence={checks:{account:true,format:true,guarantee:true,mapping:true},guaranteeDays:15,reason:'Verificación ficticia'};
const send=(path,body,token=key)=>as(null).post(path,body).set('x-hotmart-hottok',token);
const webhook=state=>new URL(state.webhookUrl).pathname;
const stage=(teacher,hottok=key)=>as(teacher).put(setup,{hottok});
const check=(user,path=setup)=>as(user).get(path);

beforeEach(()=>{
  process.env.FEATURE_CHAT='1';
  process.env.FEATURE_CLASS_PACKAGES='1';
  process.env.PAYMENTS_FAKE='1';
  process.env.HOTMART_HOTTOK=sharedKey;
});
afterEach(async()=>{
  delete process.env.FEATURE_CHAT;
  delete process.env.FEATURE_CLASS_PACKAGES;
  delete process.env.HOTMART_HOTTOK;
  process.env.PAYMENTS_FAKE='0';
  await Verification.destroy({where:{}});
});

test('la conexión de cursos no vale como prueba de paquetes y la prueba no habilita cobros',async()=>{
  const teacher=await createUser('teacher','w22-docente');
  const student=await createUser('student','w22-alumno');
  process.env.PAYMENTS_FAKE='0';
  expect((await check(student)).status).toBe(403);
  expect((await stage(student)).status).toBe(403);
  const course=await as(teacher).put('/api/teacher/hotmart/connection',{hottok:key});
  expect((await send(webhook(course.body),testEvent)).status).toBe(200);
  expect((await check(teacher)).body).toMatchObject({verifiedAt:null,webhookUrl:null,pending:false,approval:'blocked'});
  const staged=await stage(teacher);
  expect(staged.status).toBe(200);
  expect(staged.text).not.toContain(key);
  expect(webhook(staged.body)).toMatch(/\/class-packages$/);
  expect((await send(webhook(staged.body),testEvent,otherKey)).status).toBe(401);
  expect((await send(webhook(staged.body),{event:'PURCHASE_APPROVED'})).status).toBe(503);
  expect((await send(webhook(staged.body),testEvent)).body).toMatchObject({test:true});
  expect((await check(teacher)).body).toMatchObject({verifiedAt:expect.any(String),pending:false,approval:'blocked'});
  await expect(provider.assertSelling({teacherId:teacher.id})).rejects.toMatchObject({code:'package_provider_verification_required'});
});

test('el enlace se guarda en una nueva versión y solo su dueña puede prepararlo',async()=>{
  const w=await packageWorld();
  const other=await createUser('teacher','w22-otra-docente');
  const path=`/api/teacher/class-packages/${w.template.id}/hotmart`;
  const body={version:w.version.version,url:'https://pay.hotmart.com/X123?off=AB7&email=test@example.invalid&sck=old',productId:'1234'};
  expect((await as(other).put(path,body)).status).toBe(404);
  expect((await as(w.teacher).put(path,{...body,url:'https://go.hotmart.com/X123'})).status).toBe(400);
  expect((await as(w.teacher).put(path,{...body,url:'https://pay.hotmart.com/X123'})).status).toBe(400);
  expect((await as(w.teacher).put(path,{...body,offerCode:'DIFFERENT'})).status).toBe(400);
  const linked=await as(w.teacher).put(path,body);
  expect(linked.status).toBe(200);
  expect(linked.body.current).toMatchObject({version:w.version.version+1,priceAmount:w.version.priceAmount,
    hotmartCheckoutUrl:'https://pay.hotmart.com/X123',hotmartProductId:'1234',hotmartOfferCode:'AB7'});
  expect((await w.version.reload()).hotmartOfferCode).not.toBe('AB7');
  expect((await as(w.teacher).put(path,body)).status).toBe(409);
});

test('la aprobación usa la cuenta probada y el pago propio se acredita una sola vez',async()=>{
  const w=await packageWorld();
  const other=await createUser('teacher','w22-otra-docente');
  const admin=await createUser('student','w22-gestor');
  await admin.update({permissions:['class_provider.verify']});
  const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID());
  const ownPath=webhook((await stage(w.teacher)).body);
  const otherPath=webhook((await stage(other,otherKey)).body);
  await send(ownPath,testEvent);
  await send(otherPath,testEvent,otherKey);
  process.env.PAYMENTS_FAKE='0';
  const candidate=(await check(admin,adminPath)).body.candidates.find(c=>c.id===w.teacher.id);
  expect(candidate.packages).toEqual([expect.objectContaining({id:w.template.id,offerCode:w.version.hotmartOfferCode})]);
  const approve=body=>as(admin).post(`${adminPath}/verify`,body);
  expect((await approve({...evidence,teacherId:w.teacher.id,revision:'obsoleta'})).status).toBe(409);
  expect((await approve({...evidence,teacherId:w.teacher.id,revision:candidate.revision})).status).toBe(200);
  expect((await check(w.teacher)).body.approval).toBe('connected');
  expect((await check(other)).body.approval).toBe('blocked');
  const start=await as(w.buyer).post(`/api/class-offers/${offer.id}/checkout`,{}).set('Idempotency-Key',randomUUID());
  expect(start.status).toBe(200);
  const order=await Order.findByPk(start.body.order.id);
  expect(ownPath).toContain(order.hotmartConnectionId);
  const body=checkout.fakeBody(order,offer);
  expect((await send(otherPath,body,otherKey)).body.ignored).toBe(true);
  expect((await send('/api/payments/hotmart/webhook',body,sharedKey)).body.ignored).toBe(true);
  expect(await Purchase.count({where:{orderId:order.id}})).toBe(0);
  expect((await send(ownPath,body)).body).toEqual({received:true});
  expect((await send(ownPath,body)).body).toEqual({received:true});
  expect(await Purchase.findAll({where:{orderId:order.id}})).toMatchObject([{unitsAvailable:w.version.sessionsCount}]);
  expect((await check(w.teacher,'/api/teacher/class-sales')).body.items).toEqual([expect.objectContaining({status:'paid',nameEs:w.version.nameEs})]);
  expect((await check(other,'/api/teacher/class-sales')).body.items).toEqual([]);
  expect((await check(w.buyer,'/api/teacher/class-sales')).status).toBe(403);

  const edited=await as(w.teacher).put(`/api/teacher/class-packages/${w.template.id}/hotmart`,{
    version:w.version.version,url:'https://pay.hotmart.com/EXAMPLE?off=NEW',productId:w.version.hotmartProductId
  });
  expect(edited.status).toBe(200);
  // La aprobación es por cuenta: el enlace nuevo se vende sin reaprobar y el frontend lo ve aprobado.
  expect((await check(w.teacher)).body.approvedPackageIds).toEqual([w.template.id]);
  const original={teacherId:w.teacher.id,packageVersion:w.version};
  const updated={teacherId:w.teacher.id,packageVersion:edited.body.current};
  await expect(provider.assertSelling(original)).resolves.toBe(order.hotmartConnectionId);
  await expect(provider.assertSelling(updated)).resolves.toBe(order.hotmartConnectionId);
  const updatedCandidate=(await check(admin,adminPath)).body.candidates.find(c=>c.id===w.teacher.id);
  expect(updatedCandidate.revision).not.toBe(candidate.revision);
  expect(updatedCandidate.packages).toEqual([expect.objectContaining({id:w.template.id,approved:true,offerCode:'NEW'})]);
  // Misma cuenta y misma conexión: reaprobar no corresponde.
  expect((await approve({...evidence,teacherId:w.teacher.id,revision:updatedCandidate.revision})).status).toBe(409);
  expect((await approve({...evidence,teacherId:w.teacher.id,revision:updatedCandidate.revision})).body.code).toBe('version_conflict');

  const newKey='clave-ficticia-rotada-w22';
  await stage(w.teacher,newKey);
  expect((await check(w.teacher)).body.approval).toBe('connected');
  await send(ownPath,testEvent,newKey);
  expect((await check(w.teacher)).body.approval).toBe('changed');
  await expect(provider.assertSelling({teacherId:w.teacher.id})).rejects.toMatchObject({code:'package_provider_verification_required'});
});

test('aprobar una vez la cuenta habilita paquetes vinculados después (oferta y checkout) y el admin los ve marcados',async()=>{
  const w=await packageWorld();
  const admin=await createUser('student','w24-gestor');
  await admin.update({permissions:['class_provider.verify']});
  const path=webhook((await stage(w.teacher)).body);
  await send(path,testEvent);
  process.env.PAYMENTS_FAKE='0';
  const candidate=(await check(admin,adminPath)).body.candidates.find(c=>c.id===w.teacher.id);
  expect(candidate.packages).toEqual([expect.objectContaining({id:w.template.id,approved:false})]);
  expect((await as(admin).post(`${adminPath}/verify`,{...evidence,teacherId:w.teacher.id,revision:candidate.revision})).status).toBe(200);
  const afterApproval=(await check(admin,adminPath)).body.candidates.find(c=>c.id===w.teacher.id);
  expect(afterApproval.packages).toEqual([expect.objectContaining({id:w.template.id,approved:true,linkedAfterApproval:false})]);

  // Se vincula un segundo paquete (del catálogo inicial) DESPUÉS de aprobar.
  const items=await catalog.list(w.teacher);
  const second=items.find(t=>t.id!==w.template.id&&t.templateKey!==w.template.templateKey);
  const linked=await as(w.teacher).put(`/api/teacher/class-packages/${second.id}/hotmart`,{
    version:second.current.version,url:'https://pay.hotmart.com/SEGUNDO1?off=SEG1',productId:'PROD-SEGUNDO'
  });
  expect(linked.status).toBe(200);
  const activated=await catalog.setStatus(w.teacher,second.id,{status:'active',version:linked.body.current.version});
  expect(activated.status).toBe('active');
  expect((await check(w.teacher)).body.approvedPackageIds.sort()).toEqual([w.template.id,second.id].sort());
  // El created_at de MySQL tiene precisión de segundos: se adelanta para no depender del reloj de la prueba.
  await Version.update({createdAt:new Date(Date.now()+3600000)},{where:{id:linked.body.current.id}});
  const status=(await check(admin,adminPath)).body.candidates.find(c=>c.id===w.teacher.id);
  expect(status.packages.find(p=>p.id===second.id)).toMatchObject({approved:true,linkedAfterApproval:true});
  expect(status.packages.find(p=>p.id===w.template.id)).toMatchObject({approved:true,linkedAfterApproval:false});

  const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:linked.body.current.id},randomUUID());
  const start=await as(w.buyer).post(`/api/class-offers/${offer.id}/checkout`,{}).set('Idempotency-Key',randomUUID());
  expect(start.status).toBe(200);
  // Sigue siendo posible bloquear: si el docente cambia la clave, nada se vende hasta reaprobar.
  await stage(w.teacher,'clave-ficticia-rotada-w24');
  await send(webhook((await check(w.teacher)).body),testEvent,'clave-ficticia-rotada-w24');
  expect((await check(w.teacher)).body.approval).toBe('changed');
  await expect(provider.assertSelling({teacherId:w.teacher.id})).rejects.toMatchObject({code:'package_provider_verification_required'});
  const blocked=await as(w.buyer).post(`/api/class-offers/${offer.id}/checkout`,{}).set('Idempotency-Key',randomUUID());
  expect(blocked.body.code).toBe('package_provider_verification_required');
});

test('vincular el enlace de Hotmart deja auditoría con los valores nuevos y anteriores',async()=>{
  const w=await packageWorld();
  const linked=await as(w.teacher).put(`/api/teacher/class-packages/${w.template.id}/hotmart`,{
    version:w.version.version,url:'https://pay.hotmart.com/AUDIT1?off=AUD1',productId:'PROD-AUDIT'
  });
  expect(linked.status).toBe(200);
  const logs=await AuditLog.findAll({where:{action:'class_package.hotmart_linked',entityId:w.template.id}});
  expect(logs).toHaveLength(1);
  expect(logs[0].actorId).toBe(w.teacher.id);
  expect(logs[0].data).toMatchObject({templateId:w.template.id,versionId:linked.body.current.id,productId:'PROD-AUDIT',offerCode:'AUD1',
    url:'https://pay.hotmart.com/AUDIT1',priceAmount:w.version.priceAmount,currency:w.version.currency,
    previous:{productId:w.version.hotmartProductId,offerCode:w.version.hotmartOfferCode,url:w.version.hotmartCheckoutUrl}});
  // Un vínculo rechazado no deja auditoría.
  expect((await as(w.teacher).put(`/api/teacher/class-packages/${w.template.id}/hotmart`,{
    version:w.version.version,url:'https://pay.hotmart.com/AUDIT2?off=AUD2',productId:'PROD-AUDIT'})).status).toBe(409);
  expect(await AuditLog.count({where:{action:'class_package.hotmart_linked',entityId:w.template.id}})).toBe(1);
});
