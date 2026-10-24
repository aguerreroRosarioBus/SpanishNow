// W05: proveedor verificado (habilitación auditada de la cuenta de Hotmart que cobra los paquetes). Todo con datos ficticios.
const {randomUUID}=require('crypto');
const {as,createUser}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const {ClassPackageProviderVerification:Verification,ClassPackageOrder:Order,AuditLog}=require('../src/models');
const offers=require('../src/services/classOffers');
const OK={checks:{account:true,format:true,guarantee:true,mapping:true},guaranteeDays:30,reason:'Cuenta, formato, garantía y mapeo confirmados en el panel ficticio'};
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';process.env.PAYMENTS_FAKE='1';});
afterEach(async()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;process.env.PAYMENTS_FAKE='0';await Verification.destroy({where:{}});});
const verifier=async()=>{const u=await createUser('student','w05-verifier');await u.update({permissions:['class_provider.verify']});return u;};
async function world(){const w=await packageWorld();const {offer}=await offers.send(w.teacher,w.conversation.id,{templateVersionId:w.version.id},randomUUID());return {...w,offer};}
const start=w=>as(w.buyer).post(`/api/class-offers/${w.offer.id}/checkout`,{}).set('Idempotency-Key',randomUUID());
const verify=(user,body=OK)=>as(user).post('/api/admin/class-provider/verify',body);
const revoke=(user,reason='Cambio de cuenta ficticio')=>as(user).post('/api/admin/class-provider/revoke',{reason});

test('sin fake y sin verificación las ventas siguen bloqueadas; la verificación habilita el checkout con el enlace de Hotmart',async()=>{
  const w=await world();process.env.PAYMENTS_FAKE='0';const admin=await verifier();
  expect((await start(w)).body.code).toBe('package_provider_verification_required');expect(await Order.count({where:{offerId:w.offer.id}})).toBe(0);
  const status=await as(admin).get('/api/admin/class-provider');expect(status.body).toMatchObject({mode:'blocked',verification:null,lastRevocation:null});
  const done=await verify(admin);expect(done.status).toBe(200);
  expect(done.body).toMatchObject({mode:'verified',verification:{guaranteeDays:30,checks:OK.checks,reason:OK.reason,verifiedBy:{id:admin.id,name:admin.name}}});
  const r=await start(w);expect(r.status).toBe(200);expect(r.body.order.provider).toBe('hotmart');
  const url=new URL(r.body.checkoutUrl);expect(url.hostname).toBe('pay.hotmart.com');
  expect(url.searchParams.get('off')).toBe(w.offer.hotmartOfferCode);expect(url.searchParams.get('sck')).toBe((await Order.findByPk(r.body.order.id)).checkoutRef);
  const row=await Verification.findOne({where:{verifiedById:admin.id}});
  const audit=await AuditLog.findOne({where:{action:'class_provider.verified',entityId:row.id}});
  expect(audit).toMatchObject({actorId:admin.id,entityType:'class_package_provider_verifications',reason:OK.reason,data:{checks:OK.checks,guaranteeDays:30}});
});
test('la verificación no cambia PAYMENTS_FAKE: con fake=1 el modo sigue siendo simulado',async()=>{
  const admin=await verifier();await verify(admin);
  const w=await world();const r=await start(w);expect(r.body.order.provider).toBe('fake');expect(r.body.checkoutUrl).toContain('checkout=fake');
  expect((await as(admin).get('/api/admin/class-provider')).body.mode).toBe('fake');
});
test.each([
  ['un check en falso',{...OK,checks:{...OK.checks,mapping:false}}],
  ['falta un check',{...OK,checks:{account:true,format:true,guarantee:true}}],
  ['check extra',{...OK,checks:{...OK.checks,other:true}}],
  ['check no booleano',{...OK,checks:{...OK.checks,account:'true'}}],
  ['garantía inválida',{...OK,guaranteeDays:10}],
  ['garantía como texto',{...OK,guaranteeDays:'30'}],
  ['sin motivo',{...OK,reason:'   '}],
  ['motivo largo',{...OK,reason:'x'.repeat(501)}],
  ['campo extra',{...OK,extra:1}]
])('verify rechaza %s con 400 y no crea nada',async(name,body)=>{
  const admin=await verifier();const before=await Verification.count();
  const r=await verify(admin,body);expect(r.status).toBe(400);expect(await Verification.count()).toBe(before);
});
test('segundo verify con una vigente responde 409; revoke bloquea de nuevo, audita y permite verificar otra vez',async()=>{
  const w=await world();process.env.PAYMENTS_FAKE='0';const admin=await verifier();
  expect((await revoke(admin)).status).toBe(409);
  expect((await verify(admin)).status).toBe(200);expect((await verify(admin)).status).toBe(409);
  expect((await verify(admin)).body.code).toBe('version_conflict');
  expect((await start(w)).status).toBe(200);
  const r=await revoke(admin,'  Cuenta cambiada  ');expect(r.status).toBe(200);
  expect(r.body).toMatchObject({mode:'blocked',verification:null,lastRevocation:{reason:'Cuenta cambiada',revokedBy:{id:admin.id}}});
  expect((await start(w)).body.code).toBe('package_provider_verification_required');
  const row=await Verification.findOne({where:{verifiedById:admin.id}});expect(row).toMatchObject({revokedById:admin.id,revokeReason:'Cuenta cambiada'});expect(row.revokedAt).not.toBeNull();
  expect(await AuditLog.count({where:{action:'class_provider.revoked',entityId:row.id,actorId:admin.id}})).toBe(1);
  expect((await revoke(admin)).status).toBe(409);
  expect((await verify(admin)).status).toBe(200);expect(await Verification.count({where:{revokedAt:null}})).toBe(1);
});
test('revoke exige motivo',async()=>{
  const admin=await verifier();await verify(admin);
  expect((await as(admin).post('/api/admin/class-provider/revoke',{reason:''})).status).toBe(400);
  expect((await as(admin).post('/api/admin/class-provider/revoke',{reason:'x',extra:1})).status).toBe(400);
  expect(await Verification.count({where:{revokedAt:null}})).toBe(1);
});
test('permisos: verify y revoke exigen class_provider.verify; la lectura también admite class_payments.review',async()=>{
  const plain=await createUser('teacher','w05-plain');const reviewer=await createUser('student','w05-reviewer');await reviewer.update({permissions:['class_payments.review']});
  for(const user of [plain,reviewer]){expect((await verify(user)).status).toBe(403);expect((await revoke(user)).status).toBe(403);}
  expect((await as(plain).get('/api/admin/class-provider')).status).toBe(403);
  expect((await as(null).get('/api/admin/class-provider')).status).toBe(401);
  expect((await as(reviewer).get('/api/admin/class-provider')).status).toBe(200);
  expect(await Verification.count()).toBe(0);
});
test('dos verify concurrentes dejan una sola verificación vigente',async()=>{
  const a=await verifier();const b=await verifier();
  const replies=await Promise.all([verify(a),verify(b),verify(a)]);
  expect(replies.map(r=>r.status).sort()).toEqual([200,409,409]);
  expect(await Verification.count({where:{revokedAt:null}})).toBe(1);expect(await AuditLog.count({where:{action:'class_provider.verified',entityType:'class_package_provider_verifications',entityId:(await Verification.findOne()).id}})).toBe(1);
});
