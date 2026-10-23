const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const credits = require('../src/services/classCredits');
const { chain, uuid } = require('./helpers/classSessions');
const { as, createUser, tokenFor } = require('./helpers/fixtures');
const time = require('../src/domain/classTime');

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

async function confirmed(c) {
  const result = await sessions.create(c.teacher, c.body, uuid());
  let session;
  for (const student of c.students) session = await sessions.accept(student, result.session.id, 1);
  return session;
}

test.each([1, 2, 3])('confirmación de %i plazas reserva una unidad por compra solo tras aceptar todos', async size => {
  const c = await chain({ size });
  const result = await sessions.create(c.teacher, c.body, uuid());
  for (let i = 0; i < size; i++) {
    const r = await sessions.accept(c.students[i], result.session.id, 1);
    expect(r.status).toBe(i === size - 1 ? 'confirmed' : 'proposed');
    for (const p of c.purchases) expect(await credits.balance(p.id)).toMatchObject({ available: i === size - 1 ? 3 : 4, reserved: i === size - 1 ? 1 : 0 });
  }
  await sessions.accept(c.students[0], result.session.id, 1);
  for (const p of c.purchases) expect(await credits.balance(p.id)).toMatchObject({ reserved: 1 });
  expect(await M.OutboxJob.count({ where: { aggregateType: 'class_sessions', aggregateId: result.session.id, topic: 'reminder.session', status: 'pending' } })).toBe((size + 1) * 2);
});

test('AC04: con una unidad, dos confirmaciones de sesiones diferentes no gastan dos veces', async () => {
  const c = await chain({ units: 1 });
  const a = await sessions.create(c.teacher, c.body, uuid());
  const otherBody = { ...c.body, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '11:00') } };
  const b = await sessions.create(c.teacher, otherBody, uuid());
  const outcomes = await Promise.allSettled([a, b].map(s => sessions.accept(c.students[0], s.session.id, 1)));
  expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find(r => r.status === 'rejected').reason.code).toBe('insufficient_credit');
  expect(await credits.balance(c.purchases[0].id)).toEqual({ granted: 1, available: 0, reserved: 1, consumed: 0, expired: 0, refunded: 0 });
});

test('AC07: reprogramación rechazada conserva original y saldo; la aceptada cambia una vez', async () => {
  const c = await chain();
  const original = await confirmed(c);
  const next = { version: original.version, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '12:00') } };
  const pending = await sessions.reschedule(c.teacher, original.id, next);
  expect(pending.startsAt).toEqual(original.startsAt);
  expect(pending.proposal.startsAt).not.toEqual(original.startsAt);
  await expect(sessions.accept(c.students[0], original.id, 1)).rejects.toMatchObject({ code: 'proposal_stale' });
  await sessions.decline(c.students[0], original.id, pending.version);
  expect((await sessions.detail(c.teacher, original.id)).startsAt).toEqual(original.startsAt);
  const again = await sessions.reschedule(c.teacher, original.id, { ...next, version: pending.version });
  const accepted = await sessions.accept(c.students[0], original.id, again.version);
  expect(accepted.startsAt.toISOString()).toBe(time.resolveLocalIntent(next.intent).startsAt);
  await sessions.accept(c.students[0], original.id, again.version);
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 3, reserved: 1 });
  expect(await M.OutboxJob.count({ where: { aggregateId: original.id, topic: 'reminder.session', status: 'pending', aggregateVersion: 1 } })).toBe(0);
});

test('AC08/TZ-T09: cancelación exactamente 24 h libera; un segundo después consume', async () => {
  for (const late of [false, true]) {
    const c = await chain();
    const s = await confirmed(c);
    const now = new Date(time.addElapsed(time.addElapsed(s.startsAt.toISOString(), { hours: -24 }), { seconds: late ? 1 : 0 }));
    const r = await sessions.cancel(c.students[0], s.id, { version: s.version, reason: 'Cambio de planes', acknowledgeCharge: late }, { now });
    expect(r.charge).toBe(late ? 'consumed' : 'none');
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 0, consumed: late ? 1 : 0, available: late ? 3 : 4 });
  }
});

test('cancelación docente libera incluso con compra pausada y flag apagado', async () => {
  const c = await chain(); const s = await confirmed(c);
  await c.purchases[0].update({ status: 'paused' });
  process.env.FEATURE_CLASS_SCHEDULING = '0';
  try {
    const response = await as(c.teacher).post(`/api/class-sessions/${s.id}/cancel`).send({ version: s.version, reason: 'No puedo dictar' });
    expect(response.status).toBe(200);
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 0, available: 4 });
  } finally { process.env.FEATURE_CLASS_SCHEDULING = '1'; }
});

test('ausencia docente y asistencia grupal por plaza resuelven una sola unidad de grupo de 2', async () => {
  const single = await chain(); const s = await confirmed(single);
  await sessions.attendance(single.teacher, s.id, { version: s.version, userId: single.students[0].id, attendance: 'teacher_no_show', reason: 'Problema del docente' }, { now: new Date(time.addElapsed(s.endsAt.toISOString(), { minutes: 1 })) });
  expect(await credits.balance(single.purchases[0].id)).toMatchObject({ available: 4, reserved: 0, consumed: 0 });
  const c = await chain({ size: 2 }); let g = await confirmed(c);
  const now = new Date(time.addElapsed(g.endsAt.toISOString(), { minutes: 1 }));
  g = await sessions.attendance(c.teacher, g.id, { version: g.version, userId: c.students[0].id, attendance: 'attended', reason: 'Clase dictada' }, { now });
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 1, consumed: 0 });
  g = await sessions.attendance(c.teacher, g.id, { version: g.version, userId: c.students[1].id, attendance: 'student_no_show', reason: 'No asistió' }, { now });
  expect(g.status).toBe('completed');
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 0, consumed: 1 });
});

test('grupo 3: cancelar una plaza devuelve solo su compra y no carga diferencia a los demás', async () => {
  const c = await chain({ size: 3 }); const s = await confirmed(c);
  const r = await sessions.cancel(c.students[0], s.id, { version: s.version, reason: 'No puedo asistir' });
  expect(r.status).toBe('confirmed');
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, reserved: 0 });
  for (const p of c.purchases.slice(1)) expect(await credits.balance(p.id)).toMatchObject({ available: 3, reserved: 1 });
  const kept = await sessions.cancel(c.teacher, s.id, { version: r.version, keepGroup: true, reason: 'Acepto dictar con dos personas al precio acordado' });
  expect(kept.status).toBe('confirmed');
});

test('PACK-21: reprogramación tardía aceptada consume original y reserva una sesión nueva una sola vez', async () => {
  const c = await chain(); const original = await confirmed(c);
  const now = new Date(time.addElapsed(original.startsAt.toISOString(), { hours: -1 }));
  const p = await sessions.reschedule(c.teacher, original.id, { version: original.version,
    intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '12:00') }, requestedByStudentId: c.students[0].id,
    leadTimeException: true, reason: 'Excepción explícita acordada' }, { now });
  expect(p.proposal.charge).toBe('consumed_and_new_credit');
  await expect(sessions.accept(c.students[0], original.id, p.version, {}, { now })).rejects.toMatchObject({ code: 'validation_failed' });
  const next = await sessions.accept(c.students[0], original.id, p.version, { acknowledgeCharge: true }, { now });
  expect(next.id).not.toBe(original.id);
  expect(next.status).toBe('confirmed');
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 2, consumed: 1, reserved: 1 });
  const repeated = await sessions.accept(c.students[0], original.id, p.version, { acknowledgeCharge: true }, { now });
  expect(repeated.id).toBe(next.id);
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 2, consumed: 1, reserved: 1 });
});

test('dispensa docente de solicitud tardía queda auditada y libera la reserva', async () => {
  const c = await chain(); const s = await confirmed(c);
  const now = new Date(time.addElapsed(s.startsAt.toISOString(), { hours: -1 }));
  await sessions.cancel(c.teacher, s.id, { version: s.version, reason: 'Solicitud del alumno',
    requestedByStudentId: c.students[0].id, chargeWaivedReason: 'Dispensa por fuerza mayor' }, { now });
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, consumed: 0, reserved: 0 });
  expect(await M.AuditLog.count({ where: { entityId: s.id, entityType: 'class_sessions', action: 'session.charge_waived' } })).toBe(1);
});

test('recordatorios durables: reentrega no duplica y cancelar invalida también el aviso de la app', async () => {
  const c = await chain(); const s = await confirmed(c);
  const job = await M.OutboxJob.findOne({ where: { aggregateType: 'class_sessions', aggregateId: s.id, topic: 'reminder.session' }, order: [['runAt', 'ASC']] });
  const outbox = require('../src/services/outbox');
  await outbox.runOnce({ limit: 200, now: new Date(job.runAt.getTime() + 1) });
  const first = await sessions.remindersFeed(c.students[0]);
  expect(first.items.some(i => i.sessionId === s.id)).toBe(true);
  const receiptCount = await M.AuditLog.count({ where: { entityType: 'class_sessions', entityId: s.id, action: 'session.reminder' } });
  await job.reload(); await job.update({ status: 'pending', runAt: new Date() });
  await outbox.runOnce({ limit: 1 });
  expect(await M.AuditLog.count({ where: { entityType: 'class_sessions', entityId: s.id, action: 'session.reminder' } })).toBe(receiptCount);
  await sessions.cancel(c.teacher, s.id, { version: s.version, reason: 'No se podrá dictar' });
  expect((await sessions.remindersFeed(c.students[0])).items.some(i => i.sessionId === s.id)).toBe(false);
});

test('grupo 3 requiere decisión docente antes de dictar con menos personas', async () => {
  const c = await chain({ size: 3 }); const s = await confirmed(c);
  const changed = await sessions.cancel(c.students[0], s.id, { version: s.version, reason: 'No podré asistir' });
  expect(changed.groupResolutionRequired).toBe(true);
  await expect(sessions.attendance(c.teacher, s.id, { version: changed.version, userId: c.students[1].id,
    attendance: 'attended', reason: 'Clase dictada' }, { now: new Date(s.endsAt.getTime() + 1) })).rejects.toMatchObject({ code: 'group_incomplete' });
});

test('opciones solo del docente dueño y enlace Zoom solo de participante, sin anfitrión guardado', async () => {
  const c = await chain(); const s = await confirmed(c);
  const own = await as(c.teacher).get(`/api/class-sessions/options?conversationId=${c.conversations[0].id}`);
  expect(own.status).toBe(200);
  expect(own.body.purchases.some(p => p.id === c.purchases[0].id)).toBe(true);
  expect((await as(c.students[0]).get('/api/class-sessions/options')).status).toBe(403);
  const other = await createUser('teacher', 'otro-docente');
  expect((await as(other).get(`/api/class-sessions/options?conversationId=${c.conversations[0].id}`)).status).toBe(404);
  await M.ExternalSyncRef.update({ joinUrl: 'https://zoom.us/j/12345', status: 'ready' }, { where: { sessionId: s.id, provider: 'zoom' } });
  expect((await as(c.students[0]).get(`/api/class-sessions/${s.id}/join`)).body).toEqual({ joinUrl: 'https://zoom.us/j/12345', manual: false });
  expect((await as(c.teacher).get(`/api/class-sessions/${s.id}/join`)).body.code).toBe('provider_unavailable');
  expect((await as(c.teacher).post(`/api/class-sessions/${s.id}/sync/retry`)).body.code).toBe('integration_not_connected');
});

test('grupo reducido: solo quienes siguen aceptan la reprogramación, sin otro descuento', async () => {
  const c = await chain({ size: 3 }); const s = await confirmed(c);
  let current = await sessions.cancel(c.students[0], s.id, { version: s.version, reason: 'No puedo continuar' });
  current = await sessions.cancel(c.teacher, s.id, { version: current.version, keepGroup: true, reason: 'Dictaré con dos al mismo precio' });
  current = await sessions.reschedule(c.teacher, s.id, { version: current.version, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '12:00') } });
  for (const student of c.students.slice(1)) current = await sessions.accept(student, s.id, current.version);
  expect(current.proposal.status).toBe('accepted');
  expect(current.participants.find(p => p.userId === c.students[0].id).status).toBe('cancelled');
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, reserved: 0 });
  for (const p of c.purchases.slice(1)) expect(await credits.balance(p.id)).toMatchObject({ available: 3, reserved: 1, consumed: 0 });
});

test('editar propuesta inicial invalida la aceptación vieja sin conservar un horario nunca confirmado', async () => {
  const c = await chain(); const first = await sessions.create(c.teacher, c.body, uuid());
  const updated = await sessions.reschedule(c.teacher, first.session.id, { version: 1, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '11:00') } });
  expect(updated.proposal.kind).toBe('initial'); expect(updated.version).toBe(2);
  await expect(sessions.accept(c.students[0], updated.id, 1)).rejects.toMatchObject({ code: 'proposal_stale' });
  expect((await sessions.accept(c.students[0], updated.id, 2)).status).toBe('confirmed');
});

test('grupo incompleto queda forming y no confirma hasta identificar todas las compras', async () => {
  const c = await chain({ size: 3 }); await c.purchases[2].update({ status: 'cancelled' });
  const body = { ...c.body, participants: c.body.participants.map((p, i) => i === 2 ? { userId: p.userId, purchaseId: null } : p) };
  const r = await sessions.create(c.teacher, body, uuid()); expect(r.session.status).toBe('forming');
  await expect(sessions.accept(c.students[0], r.session.id, 1)).rejects.toMatchObject({ code: 'group_incomplete' });
  await c.purchases[2].update({ status: 'active' });
  for (const student of c.students) await sessions.accept(student, r.session.id, 1);
  for (const p of c.purchases) expect(await credits.balance(p.id)).toMatchObject({ reserved: 1 });
});

test('concurrencia entre docentes también serializa la agenda del alumno', async () => {
  const a = await chain(); const b = await chain({ students: a.students });
  const result = await Promise.allSettled([sessions.create(a.teacher, a.body, uuid()), sessions.create(b.teacher, { ...b.body, intent: a.body.intent }, uuid())]);
  expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(result.find(r => r.status === 'rejected').reason.code).toBe('schedule_conflict');
});

test('suspender un alumno no impide al docente liberar compromisos ni permite confirmar', async () => {
  const c = await chain(); const s = await confirmed(c);
  await c.students[0].update({ suspendedAt: new Date() });
  await sessions.cancel(c.teacher, s.id, { version: s.version, reason: 'Resolver compromiso de cuenta suspendida' });
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, reserved: 0 });
});

test('la API exige reconocimiento de cargo tardío antes de consumir crédito', async () => {
  const c = await chain(); const s = await confirmed(c); const now = new Date(time.addElapsed(s.startsAt.toISOString(), { hours: -1 }));
  await expect(sessions.cancel(c.students[0], s.id, { version: s.version, reason: 'Cancelar tarde' }, { now })).rejects.toMatchObject({ code: 'validation_failed' });
  expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 1, consumed: 0 });
});
