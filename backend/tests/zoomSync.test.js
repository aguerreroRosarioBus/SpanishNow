const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/app');
const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const zoom = require('../src/services/zoomService');
const adapter = require('../src/services/zoomAdapter');
const connection = require('../src/services/zoomConnection');
const cipher = require('../src/services/liveGoogleService');
const outbox = require('../src/services/outbox');
const { chain, uuid } = require('./helpers/classSessions');
const { as, createUser } = require('./helpers/fixtures');
const { connected } = require('./zoomFixtures');
beforeAll(() => {
  process.env.FEATURE_ZOOM = '1'; process.env.FEATURE_CLASS_SCHEDULING = '1'; process.env.FEATURE_CLASS_PACKAGES = '1'; process.env.INTEGRATIONS_FAKE = '1';
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64'); process.env.ZOOM_WEBHOOK_SECRET_TOKEN = 'webhook-test-only';
});
afterAll(() => { for (const key of ['FEATURE_ZOOM', 'FEATURE_CLASS_SCHEDULING', 'FEATURE_CLASS_PACKAGES', 'INTEGRATIONS_FAKE', 'ZOOM_WEBHOOK_SECRET_TOKEN']) delete process.env[key]; });
const createdSessions = new Set();
afterEach(async () => {
  jest.restoreAllMocks();
  // Estas fixtures no deben dejar jobs que agoten el lote de las pruebas compartidas W06.
  await M.OutboxJob.destroy({ where: { aggregateType: 'class_sessions', aggregateId: [...createdSessions] } });
  createdSessions.clear();
});
const refFor = sessionId => M.ExternalSyncRef.findOne({ where: { sessionId, provider: 'zoom' } });
const sync = sessionId => zoom.sync({ aggregateId: sessionId });
async function fixture() {
  const c = await chain(); await connected(c.teacher);
  const { session } = await sessions.create(c.teacher, c.body, uuid());
  createdSessions.add(session.id);
  const confirmed = await sessions.accept(c.students[0], session.id, 1);
  return { ...c, session: confirmed };
}
test('AC05: sync durable refleja UTC de NY y duración, configuración protegida sin grabación', async () => {
  const c = await fixture(); await sync(c.session.id);
  const ref = await refFor(c.session.id); const { tokens } = await connection.credentials(c.teacher.id);
  const meeting = await adapter.find(tokens, ref.correlationKey);
  expect(meeting).toMatchObject({ startsAt: c.session.startsAt.toISOString(), minutes: 50, timeZone: 'UTC',
    settings: { waitingRoom: true, passcodeRequired: true, autoRecording: 'none', joinBeforeHost: false } });
  expect(ref.status).toBe('ready'); expect(ref.syncedVersion).toBe(c.session.version);
  expect(await M.OutboxJob.count({ where: { aggregateId: c.session.id, topic: 'zoom.sync' } })).toBe(1);
});
test('AC15: respuesta perdida después de crear se reconcilia incluso al recargar el adaptador', async () => {
  const c = await fixture(); const create = adapter.create;
  const spy = jest.spyOn(adapter, 'create').mockImplementationOnce(async (...args) => { await create(...args); throw new Error('https://zoom.us/s/secret?zak=secret token=secret'); });
  await expect(sync(c.session.id)).rejects.toMatchObject({ code: 'zoom_provider_unavailable' });
  expect((await refFor(c.session.id)).lastError).toBe('zoom_provider_unavailable');
  // Un proceso nuevo lee el mismo proveedor fake en disco.
  let nextAdapter;
  jest.isolateModules(() => { nextAdapter = require('../src/services/zoomAdapter'); });
  const { tokens } = await connection.credentials(c.teacher.id);
  expect(await nextAdapter.find(tokens, `zoom:session:${c.session.id}`)).toBeTruthy();
  await sync(c.session.id); expect(spy).toHaveBeenCalledTimes(1);
  expect((await refFor(c.session.id)).status).toBe('ready');
});
test('reprogramar actualiza la misma reunión; cancelar dos veces no toca saldo ni crea otra', async () => {
  const c = await fixture(); await sync(c.session.id); const original = await refFor(c.session.id);
  const p = await sessions.reschedule(c.teacher, c.session.id, { version: c.session.version,
    intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '12:00') } });
  await sessions.accept(c.students[0], c.session.id, p.version); await sync(c.session.id);
  const updated = await refFor(c.session.id); expect(updated.externalId).toBe(original.externalId);
  const { tokens } = await connection.credentials(c.teacher.id);
  expect((await adapter.find(tokens, updated.correlationKey)).startsAt).toBe((await M.ClassSession.findByPk(c.session.id)).startsAt.toISOString());
  await sessions.cancel(c.teacher, c.session.id, { version: p.version, reason: 'Cancelación docente de prueba' });
  const before = (await c.purchases[0].reload()).toJSON();
  await sync(c.session.id); await sync(c.session.id);
  expect((await refFor(c.session.id)).status).toBe('cancelled'); expect(await adapter.find(tokens, original.correlationKey)).toBeNull();
  expect((await c.purchases[0].reload()).unitsAvailable).toBe(before.unitsAvailable);
});
test('AC16: host efímero solo dueño; alumno/Calendar/soporte no reciben el secreto', async () => {
  const c = await fixture(); await sync(c.session.id);
  const host = await as(c.teacher).get(`/api/class-sessions/${c.session.id}/join`);
  expect(host.body.hostUrl).toContain('/s/'); expect(host.headers['cache-control']).toBe('no-store');
  const next = await zoom.join(c.teacher, c.session.id); expect(next.hostUrl).not.toBe(host.body.hostUrl);
  const student = await zoom.join(c.students[0], c.session.id); expect(student.joinUrl).toContain('/j/'); expect(student).not.toHaveProperty('hostUrl');
  const other = await createUser('teacher', 'zoom-soporte'); await other.update({ permissions: ['class_sessions.support'] });
  expect((await as(other).get(`/api/class-sessions/${c.session.id}/join`)).status).toBe(404);
  const persisted = JSON.stringify(await refFor(c.session.id)); expect(persisted).not.toMatch(/zak|hostUrl|start_url|\/s\//);
  expect(JSON.stringify((await as(c.students[0]).get(`/api/class-sessions/${c.session.id}`)).body)).not.toMatch(/zak|hostUrl|start_url/);
  process.env.FEATURE_ZOOM = '0'; expect((await zoom.join(c.teacher, c.session.id)).hostUrl).toContain('/s/'); process.env.FEATURE_ZOOM = '1';
  // También una ref heredada sin ID externo debe validar que el enlace sea de participante.
  await (await refFor(c.session.id)).update({ externalId: null, joinUrl: 'https://zoom.us/s/123456789?zak=no_exponer' });
  await expect(zoom.join(c.students[0], c.session.id)).rejects.toMatchObject({ code: 'zoom_invalid_link' });
});
test('capacidad antes de proponer, ofrecer o comprar; no modifica agenda ni saldo', async () => {
  const c = await chain(); await connected(c.teacher);
  const row = await connection.rowFor(c.teacher.id); const tokens = cipher.decrypt(row.credentials); tokens.capabilities.maxMinutes = 40;
  await row.update({ credentials: cipher.encrypt(tokens) });
  const proposed = await as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', uuid()).send(c.body);
  expect(proposed.body.code).toBe('zoom_capacity_exceeded');
  const offer = await as(c.teacher).post(`/api/conversations/${c.conversations[0].id}/offers`).set('Idempotency-Key', uuid()).send({ templateVersionId: c.terms.id });
  expect(offer.body.code).toBe('zoom_capacity_exceeded');
  const order = await M.ClassOffer.findOne({ where: { teacherId: c.teacher.id } });
  expect((await as(c.students[0]).post(`/api/class-offers/${order.id}/checkout`).set('Idempotency-Key', uuid()).send({})).body.code).toBe('zoom_capacity_exceeded');
  expect(await M.ClassSession.count({ where: { teacherId: c.teacher.id } })).toBe(0);
});
test('manual: solo dueño con versión, URL participante válida y auditoría sin URL', async () => {
  const c = await fixture(); await connection.disconnect(c.teacher);
  for (const link of ['https://zoom.us/s/123456789?zak=secret', 'https://zoom.us.evil.test/j/123456789', 'https://x@zoom.us/j/123456789', 'http://zoom.us/j/123456789', 'https://zoom.us/j/123456789?zak=secret']) {
    await expect(zoom.manual(c.teacher, c.session.id, { version: 1, joinUrl: link })).rejects.toMatchObject({ code: 'zoom_invalid_link' });
  }
  await expect(zoom.manual(c.students[0], c.session.id, { version: 1, joinUrl: 'https://zoom.us/j/123456789' })).rejects.toMatchObject({ code: 'not_found' });
  await expect(zoom.manual(c.teacher, c.session.id, { version: 99, joinUrl: null })).rejects.toMatchObject({ code: 'version_conflict' });
  await zoom.manual(c.teacher, c.session.id, { version: c.session.version, joinUrl: 'https://zoom.us/j/123456789?pwd=protected' });
  expect(await zoom.join(c.students[0], c.session.id)).toEqual({ joinUrl: 'https://zoom.us/j/123456789?pwd=protected', manual: true });
  expect((await refFor(c.session.id)).status).toBe('needs_attention');
  expect(JSON.stringify(await M.AuditLog.findAll({ where: { action: 'zoom.manual_link', entityId: c.session.id } }))).not.toContain('pwd=');
});
test('revocación deja estado accionable, retry independiente de Calendar y conserva reservas', async () => {
  const c = await fixture(); await sync(c.session.id);
  await connection.disconnect(c.teacher);
  await expect(sync(c.session.id)).rejects.toMatchObject({ code: 'integration_not_connected' });
  expect((await refFor(c.session.id)).status).toBe('needs_attention');
  await connected(c.teacher); await zoom.retry(c.teacher, c.session.id); await sync(c.session.id);
  expect((await refFor(c.session.id)).status).toBe('ready'); expect((await c.purchases[0].reload()).unitsReserved).toBe(1);
});
function webhook(body, { timestamp = String(Math.floor(Date.now() / 1000)), signature } = {}) {
  const raw = JSON.stringify(body);
  const signed = signature || `v0=${crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update(`v0:${timestamp}:${raw}`).digest('hex')}`;
  return request(app).post('/api/integrations/zoom/webhook').set('Content-Type', 'application/json').set('x-zm-request-timestamp', timestamp).set('x-zm-signature', signed).send(raw);
}
test('webhooks: firma, antigüedad, challenge y dedupe durable sin completar ni consumir', async () => {
  const c = await fixture(); await sync(c.session.id); const ref = await refFor(c.session.id);
  const { tokens } = await connection.credentials(c.teacher.id);
  const body = { event: 'meeting.ended', event_ts: Date.now(), payload: { account_id: tokens.accountId, object: { id: ref.externalId } } };
  expect((await webhook(body, { signature: 'v0=bad' })).status).toBe(401);
  expect((await webhook(body, { signature: 'v0=' + 'ñ'.repeat(64) })).status).toBe(401);
  expect((await webhook(body, { timestamp: String(Math.floor(Date.now() / 1000) - 400) })).status).toBe(401);
  const challenge = await webhook({ event: 'endpoint.url_validation', payload: { plainToken: 'challenge' } });
  expect(challenge.body.encryptedToken).toBe(crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update('challenge').digest('hex'));
  await webhook(body); await webhook(body);
  expect(await M.AuditLog.count({ where: { action: 'zoom.webhook', entityType: 'external_connections', entityId: ref.connectionId } })).toBe(1);
  expect((await M.ClassSession.findByPk(c.session.id)).status).toBe('confirmed'); expect((await c.purchases[0].reload()).unitsConsumed).toBe(0);
  await webhook({ ...body, event: 'meeting.deleted', payload: { ...body.payload, account_id: 'foreign' } });
  expect((await refFor(c.session.id)).status).toBe('ready');
  await webhook({ ...body, event: 'meeting.deleted' }); expect((await refFor(c.session.id)).lastError).toBe('zoom_meeting_missing');
  await webhook({ ...body, event: 'app_deauthorized' });
  expect((await connection.rowFor(c.teacher.id)).status).toBe('revoked');
  expect((await M.ClassSession.findByPk(c.session.id)).status).toBe('confirmed');
  expect((await c.purchases[0].reload()).unitsReserved).toBe(1);
});
test('outbox backoff y reintento después de límite de proveedor', async () => {
  const c = await fixture();
  const job = await M.OutboxJob.findOne({ where: { aggregateId: c.session.id, topic: 'zoom.sync' } });
  await job.update({ runAt: new Date(0) });
  jest.spyOn(adapter, 'find').mockRejectedValueOnce(new adapter.ZoomError('zoom_rate_limited', 429));
  const first = await outbox.runOnce({ limit: 1 }); expect(first.retried).toBe(1);
  await job.reload(); expect(job.attempts).toBe(1); expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
  await job.update({ runAt: new Date(0) }); expect((await outbox.runOnce({ limit: 1 })).done).toBe(1);
  expect((await refFor(c.session.id)).status).toBe('ready');
});
test('concurrencia entre jobs de la misma sesión excluye duplicados', async () => {
  const c = await fixture(); const spy = jest.spyOn(adapter, 'create');
  const results = await Promise.allSettled([sync(c.session.id), sync(c.session.id)]);
  expect(results.some(r => r.status === 'fulfilled')).toBe(true); expect(spy).toHaveBeenCalledTimes(1);
});

test('Calendar recibe solo participante: sync listo y cambios manuales encolan recuperación', async () => {
  const c = await fixture();
  await M.ExternalConnection.create({ userId: c.teacher.id, provider: 'google_calendar', status: 'connected' });
  process.env.FEATURE_GOOGLE_CALENDAR = '1';
  try {
    await sync(c.session.id);
    let jobs = await M.OutboxJob.findAll({ where: { aggregateId: c.session.id, topic: 'calendar.sync' } });
    expect(jobs).toHaveLength(1); expect(JSON.stringify(jobs)).not.toMatch(/zak|hostUrl|start_url/);
    await zoom.manual(c.teacher, c.session.id, { version: c.session.version, joinUrl: 'https://zoom.us/j/123456789?pwd=manual' });
    jobs = await M.OutboxJob.findAll({ where: { aggregateId: c.session.id, topic: 'calendar.sync' } });
    expect(jobs).toHaveLength(2); expect((await refFor(c.session.id)).manualJoinUrl).toContain('/j/');
  } finally { delete process.env.FEATURE_GOOGLE_CALENDAR; }
});
test('cambio interno durante create converge a cancelación sin otra reserva ni reunión', async () => {
  const c = await fixture(); const create = adapter.create;
  jest.spyOn(adapter, 'create').mockImplementationOnce(async (...args) => {
    const result = await create(...args);
    await sessions.cancel(c.teacher, c.session.id, { version: c.session.version, reason: 'Cancelada durante efecto de proveedor' });
    return result;
  });
  await sync(c.session.id); expect((await refFor(c.session.id)).status).toBe('pending');
  await sync(c.session.id); expect((await refFor(c.session.id)).status).toBe('cancelled');
  expect((await c.purchases[0].reload()).unitsReserved).toBe(0);
});
test('clase próxima sin reunión genera aviso seguro al dueño', async () => {
  const c = await fixture();
  await M.ClassSession.update({ startsAt: new Date(Date.now() + 7200000) }, { where: { id: c.session.id } });
  expect((await zoom.sessions(c.teacher)).items[0].upcomingWithoutMeeting).toBe(true);
  const read = await as(c.students[0]).get(`/api/integrations/zoom/sessions/${c.session.id}`);
  expect(read.status).toBe(200); expect(JSON.stringify(read.body)).not.toMatch(/credentials|joinUrl|hostUrl/);
});

test('P2: webhook saltea un grant ilegible y procesa revocación de otro docente', async () => {
  const bad = await fixture();
  await (await connection.rowFor(bad.teacher.id)).update({ credentials: 'ilegible' });
  const good = await fixture(); await sync(good.session.id);
  const { tokens } = await connection.credentials(good.teacher.id);
  const result = await webhook({ event: 'app_deauthorized', event_ts: Date.now(), payload: { account_id: tokens.accountId } });
  expect(result.status).toBe(200);
  expect((await connection.rowFor(bad.teacher.id)).status).toBe('needs_attention');
  expect((await connection.rowFor(good.teacher.id)).status).toBe('revoked');
  expect((await refFor(good.session.id)).lastError).toBe('zoom_revoked');
});

test.each(['refresh', 'connect', 'complete'])('P2: %s concurrente conserva la reunión válida en ready', async operation => {
  const c = await fixture(); const create = adapter.create;
  jest.spyOn(adapter, 'create').mockImplementationOnce(async (...args) => {
    const meeting = await create(...args);
    if (operation === 'refresh') {
      await (await connection.rowFor(c.teacher.id)).update({ tokenExpiresAt: new Date(0) });
      await connection.credentials(c.teacher.id);
    } else if (operation === 'connect') await connection.connect(c.teacher);
    else await connected(c.teacher);
    return meeting;
  });
  await sync(c.session.id);
  expect((await refFor(c.session.id)).status).toBe('ready');
  expect(await zoom.join(c.students[0], c.session.id)).toMatchObject({ manual: false, joinUrl: expect.stringContaining('/j/') });
});
test('P2: cambio de cuenta durante create reencola y reconcilia sin exponer la reunión anterior', async () => {
  const c = await fixture(); const create = adapter.create;
  jest.spyOn(adapter, 'create').mockImplementationOnce(async (...args) => {
    const meeting = await create(...args); const row = await connection.rowFor(c.teacher.id);
    const tokens = cipher.decrypt(row.credentials); tokens.accountId = 'otra-cuenta-fake';
    await row.update({ credentials: cipher.encrypt(tokens), version: row.version + 1 });
    return meeting;
  });
  await sync(c.session.id);
  expect((await refFor(c.session.id)).status).toBe('needs_attention');
  expect(await M.OutboxJob.count({ where: { topic: 'zoom.sync', aggregateId: c.session.id } })).toBe(2);
  await expect(zoom.join(c.students[0], c.session.id)).rejects.toMatchObject({ code: 'integration_not_connected' });
  await sync(c.session.id);
  expect((await refFor(c.session.id)).status).toBe('ready');
});

test.each(['absent', 'disconnected', 'needs_attention', 'refresh'])('P2: agenda/oferta/checkout continúan con Zoom %s y permiten contingencia', async state => {
  process.env.FEATURE_CHAT = '1'; process.env.PAYMENTS_FAKE = '1';
  try {
    const w = await require('./helpers/classPackages').packageWorld();
    const c = await chain({ teacher: w.teacher, students: [w.buyer] });
    if (state !== 'absent') {
      await connected(c.teacher);
      const row = await connection.rowFor(c.teacher.id);
      await row.update(state === 'refresh' ? { tokenExpiresAt: new Date(0), refreshLockedUntil: new Date(Date.now() + 30000) } : { status: state, credentials: null });
    }
    const refresh = jest.spyOn(adapter, 'refresh');
    const proposed = await as(c.teacher).post('/api/class-sessions').set('Idempotency-Key', uuid()).send(c.body);
    expect(proposed.status).toBe(201); createdSessions.add(proposed.body.id);
    const accept = await as(c.students[0]).post(`/api/class-sessions/${proposed.body.id}/proposals/1/accept`).send({});
    expect(accept.status).toBe(200);
    const offer = await as(c.teacher).post(`/api/conversations/${w.conversation.id}/offers`).set('Idempotency-Key', uuid()).send({ templateVersionId: w.version.id });
    expect(offer.status).toBe(201);
    const checkout = await as(w.buyer).post(`/api/class-offers/${offer.body.id}/checkout`).set('Idempotency-Key', uuid()).send({});
    expect(checkout.status).toBe(200); expect(checkout.body.order.provider).toBe('fake');
    expect(refresh).not.toHaveBeenCalled();
    const ref = await refFor(proposed.body.id);
    if (state !== 'refresh') expect(ref.status).toBe('needs_attention');
    else {
      await expect(sync(proposed.body.id)).rejects.toMatchObject({ code: 'zoom_busy' });
      expect((await refFor(proposed.body.id)).status).toBe('needs_attention');
    }
    await zoom.manual(c.teacher, proposed.body.id, { version: accept.body.version, joinUrl: 'https://zoom.us/j/123456789?pwd=manual' });
    expect(await zoom.join(w.buyer, proposed.body.id)).toMatchObject({ manual: true });
  } finally { delete process.env.FEATURE_CHAT; delete process.env.PAYMENTS_FAKE; }
});

test('P3: meeting.deleted propio conserva la ref cancelled y no vuelve a needs_attention', async () => {
  const c = await fixture(); await sync(c.session.id); const ref = await refFor(c.session.id);
  const { tokens } = await connection.credentials(c.teacher.id);
  await sessions.cancel(c.teacher, c.session.id, { version: c.session.version, reason: 'Cancelación de prueba' });
  await sync(c.session.id);
  const event = { event: 'meeting.deleted', event_ts: Date.now(), payload: { account_id: tokens.accountId, object: { id: ref.externalId } } };
  expect((await webhook(event)).status).toBe(200); expect((await webhook(event)).status).toBe(200);
  expect(await refFor(c.session.id)).toMatchObject({ status: 'cancelled', lastError: null });
  expect((await c.purchases[0].reload()).unitsReserved).toBe(0);
});

test('P3: join canónico W06 respeta feature, autenticación, impersonación y pertenencia; conserva ICS', async () => {
  const c = await fixture(); await sync(c.session.id);
  process.env.FEATURE_ZOOM = '0';
  try {
    const denied = await as(c.teacher).get(`/api/class-sessions/${c.session.id}/join`);
    expect(denied.status).toBe(404); expect(denied.body.code).toBe('feature_disabled');
  } finally { process.env.FEATURE_ZOOM = '1'; }
  expect((await request(app).get(`/api/class-sessions/${c.session.id}/join`)).status).toBe(401);
  const token = require('jsonwebtoken').sign({ id: c.teacher.id, impersonatedBy: 999 }, process.env.JWT_SECRET);
  expect((await request(app).get(`/api/class-sessions/${c.session.id}/join`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
  const teacher = await as(c.teacher).get(`/api/class-sessions/${c.session.id}/join`);
  expect(teacher.status).toBe(200); expect(teacher.body.hostUrl).toContain('/s/'); expect(teacher.headers['cache-control']).toBe('no-store');
  const student = await as(c.students[0]).get(`/api/class-sessions/${c.session.id}/join`);
  expect(student.body.joinUrl).toContain('/j/'); expect(student.headers['cache-control']).toBe('no-store');
  const ics = await as(c.students[0]).get(`/api/class-sessions/${c.session.id}/calendar.ics`);
  expect(ics.status).toBe(200); expect(ics.text).toContain('/j/'); expect(ics.text).not.toMatch(/zak=|\/s\//);
});
