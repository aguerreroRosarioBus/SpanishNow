const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const credits = require('../src/services/classCredits');
const { chain, uuid } = require('./helpers/classSessions');
const { as, createUser, tokenFor } = require('./helpers/fixtures');

beforeAll(() => { process.env.FEATURE_CLASS_SCHEDULING = '1'; process.env.CHAT_UNREAD_EMAIL = '0'; });
afterAll(() => { delete process.env.FEATURE_CLASS_SCHEDULING; delete process.env.CHAT_UNREAD_EMAIL; });

test('proponer es idempotente y durable sin reservar saldo; cambia datos con la misma clave → 409', async () => {
  const c = await chain();
  const key = uuid();
  const responses = await Promise.all([1, 2].map(() => as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', key).send(c.body)));
  expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
  const session = responses[0].body;
  expect(responses[1].body.id).toBe(session.id);
  expect(session.status).toBe('proposed');
  expect(session.proposal.status).toBe('pending');
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, reserved: 0 });
  expect(await M.OutboxJob.count({ where: { aggregateType: 'class_sessions', aggregateId: session.id, topic: 'proposal.expire' } })).toBe(1);
  expect(await M.Message.count({ where: { classSessionId: session.id } })).toBe(1);
  const changed = await as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', key).send({ ...c.body, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '11:00') } });
  expect(changed.body.code).toBe('operation_key_conflict');
});

test('autorización por recurso: tercero/admin sin pertenencia recibe 404; alumno no propone', async () => {
  const c = await chain();
  const result = await sessions.create(c.teacher, c.body, uuid());
  const stranger = await createUser('teacher', 'ajeno-agenda');
  await stranger.update({ permissions: ['class_sessions.support'] });
  expect((await as(stranger).get(`/api/class-sessions/${result.session.id}`)).status).toBe(404);
  expect((await as(c.students[0]).post('/api/class-sessions').set('Idempotency-Key', uuid()).send(c.body)).status).toBe(403);
  expect((await as(c.students[0]).get(`/api/class-sessions/${result.session.id}`)).status).toBe(200);
});

test('primera acción exige zona confirmada y el servidor rechaza UTC manipulado', async () => {
  const c = await chain();
  await c.teacher.update({ timeZoneConfirmedAt: null });
  const result = await as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', uuid()).send(c.body);
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: 'time_zone_invalid', params: { reason: 'confirmation_required' } });
  await c.teacher.update({ timeZoneConfirmedAt: new Date() });
  const bad = await as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', uuid()).send({ ...c.body, intent: { ...c.body.intent, startsAt: new Date().toISOString() } });
  expect(bad.body.code).toBe('validation_failed');
});

test('propuesta bloquea horario hasta expiración, que conserva compra y libera solo el bloqueo', async () => {
  const c = await chain();
  const result = await sessions.create(c.teacher, c.body, uuid());
  await expect(sessions.create(c.teacher, c.body, uuid())).rejects.toMatchObject({ code: 'schedule_conflict' });
  await sessions.expire(result.session.id, 1, { now: new Date(new Date(result.session.proposal.expiresAt).getTime() + 1) });
  expect((await sessions.detail(c.teacher, result.session.id)).status).toBe('expired');
  await sessions.create(c.teacher, c.body, uuid());
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, reserved: 0 });
});

test('paquete ajeno, pausado o incompatible se rechaza antes de proponer', async () => {
  const a = await chain(), b = await chain();
  await expect(sessions.create(a.teacher, { ...a.body, participants: [{ userId: a.students[0].id, purchaseId: b.purchases[0].id }] }, uuid())).rejects.toMatchObject({ code: 'not_found' });
  await a.purchases[0].update({ status: 'paused' });
  await expect(sessions.create(a.teacher, a.body, uuid())).rejects.toMatchObject({ code: 'package_not_active' });
  await a.purchases[0].update({ status: 'active' });
  await expect(sessions.create(a.teacher, { ...a.body, intent: { ...a.body.intent, minutes: 30 } }, uuid())).rejects.toMatchObject({ code: 'validation_failed' });
});

test.each([2, 3])('grupo de %i identifica plazas y compra, sin reservar por proponer', async size => {
  const c = await chain({ size });
  const result = await sessions.create(c.teacher, c.body, uuid());
  expect(result.session.kind).toBe('group');
  expect(result.session.participants).toHaveLength(size);
  expect(await M.Message.count({ where: { classSessionId: result.session.id } })).toBe(size);
  for (const purchase of c.purchases) expect(await credits.balance(purchase.id)).toMatchObject({ available: 4, reserved: 0 });
});

test('apagar el flag bloquea propuestas y conserva lectura de compromisos', async () => {
  const c = await chain();
  const result = await sessions.create(c.teacher, c.body, uuid());
  process.env.FEATURE_CLASS_SCHEDULING = '0';
  try {
    expect((await as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', uuid()).send(c.body)).body.code).toBe('feature_disabled');
    expect((await as(c.teacher).get(`/api/class-sessions/${result.session.id}`)).status).toBe(200);
  } finally { process.env.FEATURE_CLASS_SCHEDULING = '1'; }
});
