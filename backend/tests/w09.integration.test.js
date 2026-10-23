// W09: validación de integración de punta a punta en backend (SPEC §15 AC02, AC05, AC10, AC11, AC14, AC15).
// Recorrido: oferta pagada → propuesta en Nueva York → aceptación → sync Zoom/Calendar (fakes) → clase → renovación.
// Los proveedores son siempre fakes (INTEGRATIONS_FAKE=1); ninguna prueba llama a Google ni a Zoom reales.
const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const credits = require('../src/services/classCredits');
const zoomAdapter = require('../src/services/zoomAdapter');
const zoom = require('../src/services/zoomService');
const zoomConnection = require('../src/services/zoomConnection');
const outbox = require('../src/services/outbox');
const calendar = require('../src/services/googleCalendarService');
const connections = require('../src/services/externalConnections');
const { fake } = require('../src/services/googleCalendar');
const time = require('../src/domain/classTime');
const { IntegrationError } = connections;
const { chain, uuid } = require('./helpers/classSessions');
const { as } = require('./helpers/fixtures');
const { connected } = require('./zoomFixtures');

const FLAGS = { FEATURE_ZOOM: '1', FEATURE_GOOGLE_CALENDAR: '1', FEATURE_CLASS_SCHEDULING: '1', FEATURE_CLASS_PACKAGES: '1', INTEGRATIONS_FAKE: '1' };
beforeAll(() => {
  Object.assign(process.env, FLAGS, {
    GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), ZOOM_WEBHOOK_SECRET_TOKEN: 'w09-webhook-test-only'
  });
});
afterAll(() => {
  for (const key of [...Object.keys(FLAGS), 'GOOGLE_TOKEN_ENCRYPTION_KEY', 'ZOOM_WEBHOOK_SECRET_TOKEN']) delete process.env[key];
});
beforeEach(() => fake.reset());

const created = new Set();
afterEach(async () => {
  jest.restoreAllMocks();
  await M.OutboxJob.destroy({ where: { aggregateType: 'class_sessions', aggregateId: [...created] } });
  created.clear();
});

// Mismo recorrido real que las pruebas de Calendar: /connect → proveedor → /callback → POST /complete.
async function connectCalendar(teacher) {
  const { url } = await calendar.connect(teacher);
  const params = new URL(url).searchParams;
  const redirect = new URL(await calendar.callback({ state: params.get('state'), code: 'fake-code' }));
  await calendar.complete(teacher, redirect.searchParams.get('token'));
  return M.ExternalConnection.findOne({ where: { userId: teacher.id, provider: 'google_calendar' } });
}
const drain = async (now = new Date(Date.now() + 3600e3)) => {
  let total = 0;
  for (;;) { const r = await outbox.runOnce({ limit: 50, now }); total += r.claimed; if (!r.claimed) return total; }
};
const zoomRef = sessionId => M.ExternalSyncRef.findOne({ where: { sessionId, provider: 'zoom' } });
const calendarRef = sessionId => M.ExternalSyncRef.findOne({ where: { sessionId, provider: 'google_calendar' } });

async function proposal(c) {
  const { session } = await sessions.create(c.teacher, c.body, uuid());
  created.add(session.id);
  return session;
}
async function confirmed(c) {
  const s = await proposal(c);
  let current = s;
  for (const student of c.students) current = await sessions.accept(student, s.id, 1);
  return current;
}
async function providers(teacher) {
  await connected(teacher);
  return connectCalendar(teacher);
}

describe('recorrido individual: oferta, propuesta NY, aceptación, proveedores y renovación', () => {
  test('AC02/AC05/AC14: un solo evento y una sola reunión con el mismo instante UTC; la renovación crea compra nueva', async () => {
    const c = await chain({ size: 1, units: 4 });
    await providers(c.teacher);
    const session = await confirmed(c);
    await drain();

    const ref = await zoomRef(session.id);
    expect(ref).toMatchObject({ status: 'ready', syncedVersion: session.version });
    const { tokens } = await zoomConnection.credentials(c.teacher.id);
    expect(await zoomAdapter.find(tokens, ref.correlationKey)).toMatchObject({ startsAt: session.startsAt.toISOString(), minutes: 50, timeZone: 'UTC' });
    expect(await calendarRef(session.id)).toMatchObject({ status: 'ready' });
    expect(fake.eventCount('primary')).toBe(1);

    // Clase dictada: la asistencia del docente consume la unidad reservada de la compra original.
    const now = new Date(time.addElapsed(session.endsAt.toISOString(), { minutes: 1 }));
    await sessions.attendance(c.teacher, session.id, { version: session.version, userId: c.students[0].id, attendance: 'attended', reason: 'Clase dictada' }, { now });
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 0, consumed: 1 });

    // Renovación: otra compra del mismo alumno. La compra anterior conserva su historial.
    const renewal = await chain({ teacher: c.teacher, students: c.students, units: 4 });
    expect(renewal.purchases[0].id).not.toBe(c.purchases[0].id);
    expect(await credits.balance(renewal.purchases[0].id)).toMatchObject({ available: 4, reserved: 0, consumed: 0 });
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 0, consumed: 1 });
  });

  test('AC15: Zoom y Calendar fallan al primer intento; el outbox recupera sin duplicar reunión ni evento ni saldo', async () => {
    const c = await chain({ size: 1, units: 4 });
    await providers(c.teacher);
    const session = await proposal(c);
    // Zoom: el proveedor rechaza la creación. Calendar: la respuesta se pierde después de crear el evento.
    jest.spyOn(zoomAdapter, 'create').mockRejectedValueOnce(new zoomAdapter.ZoomError('zoom_provider_unavailable', 503));
    fake.loseResponseNext('insertEvent', new IntegrationError(503, 'provider_unavailable', {}, { retryable: true }));
    await sessions.accept(c.students[0], session.id, 1);

    await drain(new Date(Date.now() + 60e3));
    await drain();

    expect(await zoomRef(session.id)).toMatchObject({ status: 'ready', lastError: null });
    expect(await calendarRef(session.id)).toMatchObject({ status: 'ready', lastError: null });
    expect(fake.eventCount('primary')).toBe(1);
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 1, consumed: 0 });
  });

  test('desconexión de Zoom: estado accionable, reintento y una sola reunión al volver', async () => {
    const c = await chain({ size: 1, units: 4 });
    await providers(c.teacher);
    const session = await confirmed(c);
    await drain();
    await zoomConnection.disconnect(c.teacher);
    await expect(zoom.sync({ aggregateId: session.id })).rejects.toMatchObject({ code: 'integration_not_connected' });
    expect(await zoomRef(session.id)).toMatchObject({ status: 'needs_attention' });
    await connected(c.teacher);
    await zoom.retry(c.teacher, session.id);
    await drain();
    expect(await zoomRef(session.id)).toMatchObject({ status: 'ready' });
    expect(await M.ExternalSyncRef.count({ where: { sessionId: session.id, provider: 'zoom' } })).toBe(1);
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 1 });
  });
});

describe('grupos de 2 y 3 alumnos', () => {
  test.each([2, 3])('grupo de %i: cada alumno acepta y sale una sola reunión y un solo evento de la sesión', async size => {
    const c = await chain({ size, units: 4 });
    await providers(c.teacher);
    const session = await confirmed(c);
    await drain();
    expect(await M.ExternalSyncRef.count({ where: { sessionId: session.id, provider: 'zoom' } })).toBe(1);
    expect(await M.ExternalSyncRef.count({ where: { sessionId: session.id, provider: 'google_calendar' } })).toBe(1);
    expect(fake.eventCount('primary')).toBe(1);
    for (const purchase of c.purchases) expect(await credits.balance(purchase.id)).toMatchObject({ reserved: 1 });
  });
});
