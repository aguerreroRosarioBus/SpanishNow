const {randomUUID}=require('crypto');
const {as}=require('./helpers/fixtures');
const {packageWorld}=require('./helpers/classPackages');
const chat=require('../src/services/chatService');
const {ClassOffer:Offer,ClassCohort:Cohort}=require('../src/models');
beforeEach(()=>{process.env.FEATURE_CHAT='1';process.env.FEATURE_CLASS_PACKAGES='1';});
afterEach(()=>{delete process.env.FEATURE_CHAT;delete process.env.FEATURE_CLASS_PACKAGES;});
async function groupWorld(key){const w=await packageWorld({key});await chat.startConversation(w.other,{teacherId:w.teacher.id});return w;}
const future=()=>new Date(Date.now()+240*3600000).toISOString();
const create=(w,ids)=>as(w.teacher).post('/api/teacher/class-cohorts',{templateVersionId:w.version.id,tentativeStartsAt:future(),invitedIds:ids});
const send=(w,body)=>as(w.teacher).post(`/api/conversations/${w.conversation.id}/offers`,{templateVersionId:w.version.id,...body}).set('Idempotency-Key',randomUUID());
test('grupo de dos: aceptación propia, privacidad y una oferta que cubre las dos plazas',async()=>{
  const w=await groupWorld('group2-1x50-total');const c=await create(w,[w.buyer.id,w.other.id]);expect(c.status).toBe(201);
  expect(c.body.members).toHaveLength(2);expect(c.body.status).toBe('forming');
  const invitation=await as(w.other).get(`/api/class-cohorts/${c.body.id}`);expect(invitation.status).toBe(200);expect(invitation.body.members).toBeUndefined();expect(invitation.body.invitation.status).toBe('invited');
  expect((await send(w,{cohortId:c.body.id,beneficiaryIds:[w.buyer.id,w.other.id]})).body.code).toBe('group_incomplete');
  expect((await as(w.buyer).post(`/api/class-cohorts/${c.body.id}/invitation/accept`)).status).toBe(200);
  expect((await as(w.other).post(`/api/class-cohorts/${c.body.id}/invitation/accept`)).status).toBe(200);
  const offer=await send(w,{cohortId:c.body.id,beneficiaryIds:[w.buyer.id,w.other.id]});expect(offer.status).toBe(201);expect(offer.body).toMatchObject({amount:3000,seatsCovered:2,sessionsCount:1});
  expect(Date.parse(offer.body.expiresAt)).toBeLessThanOrEqual(Date.parse(c.body.formingDeadlineAt));
  expect((await as(w.other).get(`/api/class-offers/${offer.body.id}`)).status).toBe(200);
  expect((await as(w.other).get(`/api/conversations/${w.conversation.id}/offers`)).status).toBe(404);
});
test('grupo de tres: tres ofertas independientes por comprador, sin asumir invitaciones o pago',async()=>{
  const {createUser}=require('./helpers/fixtures');const w=await groupWorld('group3-1x50-seat');const third=await createUser('student','w05-third');await chat.startConversation(third,{teacherId:w.teacher.id});
  const ids=[w.buyer.id,w.other.id,third.id];const c=await create(w,ids);expect(c.status).toBe(201);
  for(const u of [w.buyer,w.other,third])expect((await as(u).post(`/api/class-cohorts/${c.body.id}/invitation/accept`)).status).toBe(200);
  const r=await send(w,{cohortId:c.body.id,beneficiaryIds:[w.buyer.id]});expect(r.status).toBe(201);expect(r.body).toMatchObject({amount:1500,seatsCovered:1,snapshot:{beneficiaryIds:[w.buyer.id]}});
  expect((await send(w,{cohortId:c.body.id,beneficiaryIds:ids})).body.code).toBe('group_incomplete');
});
test('invitación rechazada no cambia de identidad; plazo vencido impide oferta y avisa sin borrar dinero',async()=>{
  const w=await groupWorld('group2-1x50-total');const c=await create(w,[w.buyer.id,w.other.id]);
  expect((await as(w.other).post(`/api/class-cohorts/${c.body.id}/invitation/decline`)).status).toBe(200);
  expect((await as(w.other).post(`/api/class-cohorts/${c.body.id}/invitation/accept`)).body.code).toBe('group_incomplete');
  await Cohort.update({formingDeadlineAt:new Date(Date.now()-1000)},{where:{id:c.body.id}});
  await require('../src/services/classCohorts').deadline({aggregateId:c.body.id});
  expect((await Cohort.findByPk(c.body.id)).status).toBe('cancelled');expect(await Offer.count({where:{cohortId:c.body.id}})).toBe(0);
  expect((await send(w,{cohortId:c.body.id,beneficiaryIds:[w.buyer.id,w.other.id]})).body.code).toBe('group_incomplete');
});
