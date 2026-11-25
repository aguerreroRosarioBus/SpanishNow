// Reglas de agenda del docente: descanso entre clases (sessionBufferMinutes) y anticipación mínima (minLeadTimeHours).
const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const time = require('../src/domain/classTime');
const { SCHEDULE_LIMITS } = require('../src/services/classCatalog');
const { chain, uuid } = require('./helpers/classSessions');
const request = require('supertest');
const { app, as } = require('./helpers/fixtures');

beforeAll(() => { process.env.FEATURE_CLASS_PACKAGES = '1'; process.env.FEATURE_CLASS_SCHEDULING = '1'; process.env.CHAT_UNREAD_EMAIL = '0'; });
afterAll(() => { delete process.env.FEATURE_CLASS_PACKAGES; delete process.env.FEATURE_CLASS_SCHEDULING; delete process.env.CHAT_UNREAD_EMAIL; });

const patch = (user, body) => request(app).patch('/api/teacher/class-settings').set('Authorization', `Bearer ${user.token}`).send(body);
const stored = async teacher => (await M.TeacherClassSettings.findByPk(teacher.id)).get({ plain: true });
// Misma clase de 50 minutos que `chain()`, pero con otra hora de comienzo (la original es 09:00, hora del docente).
const shifted = (c, hhmm) => ({ ...c.body, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', hhmm) } });

test('los topes públicos coinciden con lo que acepta el servidor', () => {
  expect(SCHEDULE_LIMITS).toEqual({ sessionBufferMinutes: 120, minLeadTimeHours: 720 });
});

test('el docente lee los valores por defecto (10 min y 24 h), los cambia y quedan guardados', async () => {
  const c = await chain();
  const before = await as(c.teacher).get('/api/teacher/class-settings');
  expect(before.body).toMatchObject({ sessionBufferMinutes: 10, minLeadTimeHours: 24 });
  const saved = await patch(c.teacher, { sessionBufferMinutes: 15, minLeadTimeHours: 48 });
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({ sessionBufferMinutes: 15, minLeadTimeHours: 48, acceptsInquiries: true });
  expect(await stored(c.teacher)).toMatchObject({ sessionBufferMinutes: 15, minLeadTimeHours: 48 });
  expect((await as(c.teacher).get('/api/teacher/class-settings')).body).toMatchObject({ sessionBufferMinutes: 15, minLeadTimeHours: 48 });
});

test('cambiar un campo no toca el otro ni las consultas ni la pausa de ventas', async () => {
  const c = await chain();
  await M.TeacherClassSettings.update({ salesPausedAt: new Date('2026-11-01T00:00:00Z') }, { where: { userId: c.teacher.id } });
  const result = await patch(c.teacher, { minLeadTimeHours: 72 });
  expect(result.status).toBe(200);
  expect(await stored(c.teacher)).toMatchObject({ sessionBufferMinutes: 10, minLeadTimeHours: 72, acceptsInquiries: true });
  expect((await stored(c.teacher)).salesPausedAt).toEqual(new Date('2026-11-01T00:00:00Z'));
});

test('0 es válido y los límites son inclusivos', async () => {
  const c = await chain();
  expect((await patch(c.teacher, { sessionBufferMinutes: 0, minLeadTimeHours: 0 })).status).toBe(200);
  expect(await stored(c.teacher)).toMatchObject({ sessionBufferMinutes: 0, minLeadTimeHours: 0 });
  expect((await patch(c.teacher, { sessionBufferMinutes: 120, minLeadTimeHours: 720 })).status).toBe(200);
  expect(await stored(c.teacher)).toMatchObject({ sessionBufferMinutes: 120, minLeadTimeHours: 720 });
});

test.each([
  ['sessionBufferMinutes', -1], ['sessionBufferMinutes', 121], ['sessionBufferMinutes', 1.5], ['sessionBufferMinutes', '10'], ['sessionBufferMinutes', null],
  ['sessionBufferMinutes', 65535], ['minLeadTimeHours', -1], ['minLeadTimeHours', 721], ['minLeadTimeHours', 0.5], ['minLeadTimeHours', '24'], ['minLeadTimeHours', null]
])('%s = %p se rechaza con validation_failed y no cambia nada', async (field, value) => {
  const c = await chain();
  const result = await patch(c.teacher, { [field]: value });
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: 'validation_failed', params: { fields: [field] } });
  expect(await stored(c.teacher)).toMatchObject({ sessionBufferMinutes: 10, minLeadTimeHours: 24 });
});

test('un valor inválido junto a uno válido no guarda ninguno (todo o nada)', async () => {
  const c = await chain();
  expect((await patch(c.teacher, { sessionBufferMinutes: 30, minLeadTimeHours: 9999 })).status).toBe(400);
  expect(await stored(c.teacher)).toMatchObject({ sessionBufferMinutes: 10, minLeadTimeHours: 24 });
});

test('solo docentes: el alumno no puede cambiar las reglas de agenda', async () => {
  const c = await chain();
  const result = await patch(c.students[0], { sessionBufferMinutes: 0 });
  expect([401, 403]).toContain(result.status);
});

test('el descanso configurado se aplica al proponer otra clase del mismo docente', async () => {
  const c = await chain();
  await sessions.create(c.teacher, c.body, uuid()); // 09:00–09:50 hora del docente
  const tenTen = shifted(c, '10:10'); // empieza 20 minutos después de terminar la primera
  await patch(c.teacher, { sessionBufferMinutes: 30 });
  await expect(sessions.create(c.teacher, tenTen, uuid())).rejects.toMatchObject({ code: 'schedule_conflict' });
  await patch(c.teacher, { sessionBufferMinutes: 15 });
  const ok = await sessions.create(c.teacher, tenTen, uuid());
  expect(ok.session.status).toBe('proposed');
});

test('con descanso 0 dos clases pueden quedar pegadas, pero no superpuestas', async () => {
  const c = await chain();
  await patch(c.teacher, { sessionBufferMinutes: 0 });
  await sessions.create(c.teacher, c.body, uuid()); // 09:00–09:50
  await expect(sessions.create(c.teacher, shifted(c, '09:30'), uuid())).rejects.toMatchObject({ code: 'schedule_conflict' });
  expect((await sessions.create(c.teacher, shifted(c, '09:50'), uuid())).session.status).toBe('proposed');
});

test('la anticipación mínima configurada se aplica al proponer y se puede relajar', async () => {
  const c = await chain();
  const startsAt = time.resolveLocalIntent(c.body.intent).startsAt;
  const now = new Date(time.addElapsed(startsAt, { hours: -60 })); // faltan 60 h
  await patch(c.teacher, { minLeadTimeHours: 72 });
  await expect(sessions.create(c.teacher, c.body, uuid(), { now })).rejects.toMatchObject({ code: 'lead_time_too_short', params: { hours: 72 } });
  await patch(c.teacher, { minLeadTimeHours: 48 });
  expect((await sessions.create(c.teacher, c.body, uuid(), { now })).session.status).toBe('proposed');
});

test('si la política del paquete pide más anticipación que el docente, rige la mayor', async () => {
  const c = await chain(); // la política por defecto pide 24 h
  const startsAt = time.resolveLocalIntent(c.body.intent).startsAt;
  const now = new Date(time.addElapsed(startsAt, { hours: -10 })); // faltan 10 h
  await patch(c.teacher, { minLeadTimeHours: 0 });
  await expect(sessions.create(c.teacher, c.body, uuid(), { now })).rejects.toMatchObject({ code: 'lead_time_too_short', params: { hours: 24 } });
});

test('con excepción explícita y motivo, el docente puede proponer dentro del aviso mínimo', async () => {
  const c = await chain();
  const startsAt = time.resolveLocalIntent(c.body.intent).startsAt;
  const now = new Date(time.addElapsed(startsAt, { hours: -30 }));
  await patch(c.teacher, { minLeadTimeHours: 720 });
  const result = await sessions.create(c.teacher, { ...c.body, leadTimeException: true, reason: 'Acordado con el alumno por chat' }, uuid(), { now });
  expect(result.session.status).toBe('proposed');
});
