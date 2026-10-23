// W07 · Google Calendar con el adaptador fake: rutas, free/busy en la confirmación, outbox calendar.sync,
// ICS, divergencias desde Google, notificaciones y recuperación (CAL-01…CAL-08, AC05, AC15).
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.INTEGRATIONS_FAKE = '1';
process.env.FEATURE_GOOGLE_CALENDAR = '1';
process.env.FEATURE_CLASS_SCHEDULING = '1';
process.env.CHAT_UNREAD_EMAIL = '0';
const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const credits = require('../src/services/classCredits');
const outbox = require('../src/services/outbox');
const connections = require('../src/services/externalConnections');
const calendar = require('../src/services/googleCalendarService');
const sync = require('../src/services/googleCalendarSync');
const { fake } = require('../src/services/googleCalendar');
const { IntegrationError } = connections;
const { chain, uuid } = require('./helpers/classSessions');
const { as, createUser } = require('./helpers/fixtures');
const time = require('../src/domain/classTime');

beforeEach(() => fake.reset());
afterEach(() => { delete process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL; process.env.FEATURE_GOOGLE_CALENDAR = '1'; });
afterAll(() => ['FEATURE_GOOGLE_CALENDAR', 'FEATURE_CLASS_SCHEDULING', 'CHAT_UNREAD_EMAIL', 'INTEGRATIONS_FAKE'].forEach(k => delete process.env[k]));

// Recorrido real: /connect → proveedor → /callback (sin sesión, deja el resultado pendiente) → POST /complete autenticado.
async function authorize(teacher) {
  const { url } = await calendar.connect(teacher);
  const params = new URL(url).searchParams;
  const redirect = new URL(await calendar.callback({ state: params.get('state'), code: 'fake-code' }));
  return { redirect, token: redirect.searchParams.get('token') };
}
async function connect(teacher) {
  const { redirect, token } = await authorize(teacher);
  expect(redirect.searchParams.get('calendar')).toBe('confirm');
  await calendar.complete(teacher, token);
  return M.ExternalConnection.findOne({ where: { userId: teacher.id, provider: 'google_calendar' } });
}
const drain = async (now) => { let total = 0; for (;;) { const r = await outbox.runOnce({ limit: 50, now }); total += r.claimed; if (!r.claimed) return total; } };
const syncJobs = sessionId => M.OutboxJob.findAll({ where: { topic: 'calendar.sync', aggregateId: sessionId }, order: [['id', 'ASC']] });
const refOf = sessionId => M.ExternalSyncRef.findOne({ where: { sessionId, provider: 'google_calendar' } });

async function proposed(c, { index = 0 } = {}) {
  const result = await sessions.create(c.teacher, c.body, uuid());
  return result.session;
}
async function confirmed(c) {
  const s = await proposed(c);
  let current = s;
  for (const student of c.students) current = await sessions.accept(student, s.id, 1);
  return current;
}
async function withConnection(options) {
  const c = await chain(options);
  const connection = await connect(c.teacher);
  return { c, connection };
}

describe('rutas y conexión (CAL-01, CAL-08)', () => {
  test('conectar con state/PKCE de un solo uso, elegir calendarios y desconectar sin tocar Drive/Classroom', async () => {
    const teacher = await createUser('teacher', 'cal-rutas');
    await M.GoogleConnection.create({ userId: teacher.id, credentials: 'cifrado-drive', email: 'drive@example.test' });
    expect((await as(teacher).get('/api/integrations/google-calendar')).body).toMatchObject({ status: 'disconnected', connected: false, enabled: true, calendars: [] });
    const started = await as(teacher).post('/api/integrations/google-calendar/connect');
    expect(started.status).toBe(200);
    const params = new URL(started.body.url).searchParams;
    expect(params.get('state')).toMatch(/^[\w-]{43}$/);
    const request = require('supertest')(require('../src/app'));
    const callback = await request.get(`/api/integrations/google-calendar/callback?state=${params.get('state')}&code=fake-code`);
    expect(callback.status).toBe(302);
    const target = new URL(callback.headers.location);
    expect(`${target.origin}${target.pathname}`).toBe('http://localhost:4200/teacher/integrations');
    expect(target.searchParams.get('calendar')).toBe('confirm');
    // El callback no conecta nada por sí solo: falta la confirmación autenticada.
    expect((await as(teacher).get('/api/integrations/google-calendar')).body).toMatchObject({ connected: false, accountEmail: null });
    expect((await as(null).post('/api/integrations/google-calendar/complete', { token: target.searchParams.get('token') })).status).toBe(401);
    const done = await as(teacher).post('/api/integrations/google-calendar/complete', { token: target.searchParams.get('token') });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'connected' });
    // El mismo state y el mismo token no se pueden reutilizar.
    const replay = await request.get(`/api/integrations/google-calendar/callback?state=${params.get('state')}&code=fake-code`);
    expect(replay.headers.location).toContain('calendar=error');
    expect((await as(teacher).post('/api/integrations/google-calendar/complete', { token: target.searchParams.get('token') })).body.code).toBe('oauth_state_invalid');
    const state = (await as(teacher).get('/api/integrations/google-calendar')).body;
    expect(state).toMatchObject({ status: 'connected', accountEmail: 'calendar-fake@example.test', targetCalendarId: 'primary', busyCalendarIds: ['primary'] });
    expect(state.calendars.map(c => c.id)).toEqual(['primary', 'clases@example.test', 'personal@example.test']);
    expect(JSON.stringify(state)).not.toMatch(/credentials|fake-at|fake-refresh|oauth/i);

    const bad = await as(teacher).request?.patch;
    const patch = body => require('supertest')(require('../src/app')).patch('/api/integrations/google-calendar').set('Authorization', `Bearer ${teacher.token}`).send(body);
    expect((await patch({ targetCalendarId: 'personal@example.test' })).status).toBe(400); // solo lectura: no se puede escribir
    expect((await patch({ targetCalendarId: 'ajeno@example.test' })).status).toBe(400);
    expect((await patch({ busyCalendarIds: 'primary' })).status).toBe(400);
    const ok = await patch({ targetCalendarId: 'clases@example.test', busyCalendarIds: ['primary', 'personal@example.test'] });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ targetCalendarId: 'clases@example.test', busyCalendarIds: ['clases@example.test', 'primary', 'personal@example.test'] });

    const removed = await as(teacher).delete('/api/integrations/google-calendar');
    expect(removed.body).toMatchObject({ status: 'disconnected', connected: false });
    const row = await M.ExternalConnection.findOne({ where: { userId: teacher.id } });
    expect(row.credentials).toBeNull();
    expect(await M.GoogleConnection.count({ where: { userId: teacher.id } })).toBe(1);
  });

  test('P1: A inicia y B completa: B es rechazado, sus tokens se revocan y A queda sin credenciales', async () => {
    const a = await createUser('teacher', 'cal-victima');
    const b = await createUser('teacher', 'cal-intruso-b');
    // A inicia /connect y manda el enlace a B; B autoriza en Google y vuelve al callback (sin sesión: sirve a cualquiera).
    const { redirect, token } = await authorize(a);
    expect(redirect.searchParams.get('calendar')).toBe('confirm');
    await expect(calendar.complete(b, token)).rejects.toMatchObject({ code: 'forbidden', statusCode: 403, params: { reason: 'oauth_user_mismatch' } });
    expect(fake.calls().revoke).toBe(1); // los tokens de B se descartan y revocan
    expect(await M.ExternalConnection.findOne({ where: { userId: a.id } })).toMatchObject({ status: 'pending', credentials: null, accountEmail: null, oauthStateHash: null });
    expect(await M.ExternalConnection.count({ where: { userId: b.id } })).toBe(0);
    // El pendiente se descartó: ni A con el mismo token puede usarlo.
    await expect(calendar.complete(a, token)).rejects.toMatchObject({ code: 'oauth_state_invalid' });
    // A puede reintentar su conexión normalmente.
    expect((await connect(a)).status).toBe('connected');
  });

  test('P1: el token de confirmación es de un solo uso y vence; un callback sin sesión no conecta nada', async () => {
    const teacher = await createUser('teacher', 'cal-token');
    const first = (await authorize(teacher)).token;
    await calendar.complete(teacher, first);
    await expect(calendar.complete(teacher, first)).rejects.toMatchObject({ code: 'oauth_state_invalid' });
    const concurrent = (await authorize(teacher)).token;
    const results = await Promise.allSettled([calendar.complete(teacher, concurrent), calendar.complete(teacher, concurrent)]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const expired = (await authorize(teacher)).token;
    await M.ExternalConnection.update({ oauthExpiresAt: new Date(Date.now() - 1000) }, { where: { userId: teacher.id } });
    await expect(calendar.complete(teacher, expired)).rejects.toMatchObject({ code: 'oauth_state_invalid' });
    await expect(calendar.complete(teacher, 'corto')).rejects.toMatchObject({ code: 'oauth_state_invalid' });
    await expect(calendar.complete(await createUser('student', 'cal-alumno-token'), first)).rejects.toMatchObject({ code: 'forbidden' });
    // Un state de inicio no sirve como token de confirmación.
    const { url } = await calendar.connect(teacher);
    await expect(calendar.complete(teacher, new URL(url).searchParams.get('state'))).rejects.toMatchObject({ code: 'oauth_state_invalid' });
  });

  test('P1: si B ya tiene Drive/Classroom o Calendar, descartar su pendiente no revoca su grant compartido', async () => {
    const a = await createUser('teacher', 'cal-a-compartido');
    const b = await createUser('teacher', 'cal-b-compartido');
    await M.GoogleConnection.create({ userId: b.id, credentials: require('../src/services/liveGoogleService').encrypt({ refreshToken: 'r', accessToken: 'a', expiresAt: 0 }), email: 'b@example.test' });
    const { token } = await authorize(a);
    await expect(calendar.complete(b, token)).rejects.toMatchObject({ code: 'forbidden' });
    expect(fake.calls().revoke || 0).toBe(0);
  });

  test('P2: redirect y FRONTEND_URL deben ser https (o http de localhost fuera de producción), sin credenciales', async () => {
    const teacher = await createUser('teacher', 'cal-https');
    const saved = { frontend: process.env.FRONTEND_URL, redirect: process.env.GOOGLE_CALENDAR_REDIRECT_URI, env: process.env.NODE_ENV };
    const unconfigured = { code: 'provider_unavailable', statusCode: 503, params: { reason: 'not_configured' } };
    try {
      process.env.FRONTEND_URL = 'http://app.example.com';
      await expect(calendar.connect(teacher)).rejects.toMatchObject(unconfigured);
      process.env.FRONTEND_URL = 'https://app.example.com';
      process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://api.example.com/api/integrations/google-calendar/callback';
      await expect(calendar.connect(teacher)).rejects.toMatchObject(unconfigured);
      process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://user:pw@api.example.com/api/integrations/google-calendar/callback';
      await expect(calendar.connect(teacher)).rejects.toMatchObject(unconfigured);
      // En producción ni siquiera localhost vale (y el valor por defecto no se usa en silencio).
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_CALENDAR_REDIRECT_URI; delete process.env.FRONTEND_URL;
      await expect(calendar.connect(teacher)).rejects.toMatchObject(unconfigured);
      process.env.FRONTEND_URL = 'https://app.example.com';
      process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://api.example.com/api/integrations/google-calendar/callback';
      expect((await calendar.connect(teacher)).url).toMatch(/^https:\/\/api\.example\.com\/api\/integrations\/google-calendar\/callback\?state=/);
      expect(calendar.frontendUrl()).toBe('https://app.example.com');
    } finally {
      for (const [k, v] of [['FRONTEND_URL', saved.frontend], ['GOOGLE_CALENDAR_REDIRECT_URI', saved.redirect], ['NODE_ENV', saved.env]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  test('P2: Calendar y Classroom/Drive comparten el grant de Google: desconectar uno no revoca al otro', async () => {
    const liveGoogle = require('../src/services/liveGoogleService');
    // Calendar se desconecta teniendo Drive/Classroom activo: solo se borran los tokens locales, sin revoke.
    const both = await createUser('teacher', 'cal-comparte');
    await connect(both);
    await M.GoogleConnection.create({ userId: both.id, credentials: liveGoogle.encrypt({ refreshToken: 'drive-r', accessToken: 'a', expiresAt: 0 }), email: 'd@example.test' });
    await calendar.disconnect(both);
    expect(fake.calls().revoke || 0).toBe(0);
    expect(await M.GoogleConnection.count({ where: { userId: both.id } })).toBe(1);
    // Sin Drive/Classroom sí se revoca el grant.
    const only = await createUser('teacher', 'cal-solo');
    await connect(only);
    await calendar.disconnect(only);
    expect(fake.calls().revoke).toBe(1);
    // Al revés: desconectar Classroom/Drive con Calendar conectado no llama a Google revoke.
    const reverse = await createUser('teacher', 'cal-inverso');
    await connect(reverse);
    await M.GoogleConnection.create({ userId: reverse.id, credentials: liveGoogle.encrypt({ refreshToken: 'drive-r', accessToken: 'a', expiresAt: 0 }), email: 'd@example.test' });
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    try {
      await liveGoogle.disconnect(reverse.id);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(await M.GoogleConnection.count({ where: { userId: reverse.id } })).toBe(0);
      expect((await M.ExternalConnection.findOne({ where: { userId: reverse.id } })).status).toBe('connected');
      // Sin Calendar conectado, Classroom/Drive sigue revocando como antes.
      const alone = await createUser('teacher', 'cal-drive-solo');
      await M.GoogleConnection.create({ userId: alone.id, credentials: liveGoogle.encrypt({ refreshToken: 'drive-r', accessToken: 'a', expiresAt: 0 }), email: 'd@example.test' });
      await liveGoogle.disconnect(alone.id);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(String(global.fetch.mock.calls[0][0])).toContain('oauth2.googleapis.com/revoke');
    } finally { delete global.fetch; }
  });

  test('P2: si Classroom/Drive revoca el grant, Calendar cae en revoked con aviso y sin perder sesiones', async () => {
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    await drain();
    fake.revokeAuthorization(); // revocar el grant compartido deja inválido también el refresh token de Calendar
    const { encrypt, decrypt } = require('../src/services/liveGoogleService');
    const row = await M.ExternalConnection.findByPk(connection.id);
    await row.update({ credentials: encrypt({ ...decrypt(row.credentials), expiresAt: 0 }) });
    await expect(calendar.status(c.teacher)).resolves.toMatchObject({ status: 'revoked', connected: false, lastError: 'authorization_revoked' });
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('confirmed');
  });

  test('solo docentes, sin impersonación y con flag apagado la superficie no existe', async () => {
    const student = await createUser('student', 'cal-alumno');
    expect((await as(student).get('/api/integrations/google-calendar')).status).toBe(403);
    expect((await as(null).get('/api/integrations/google-calendar')).status).toBe(401);
    process.env.FEATURE_GOOGLE_CALENDAR = '0';
    const teacher = await createUser('teacher', 'cal-flag');
    const off = await as(teacher).get('/api/integrations/google-calendar');
    expect(off.status).toBe(404);
    expect(off.body.code).toBe('feature_disabled');
  });
});

describe('confirmación con free/busy (CAL-03, AC05)', () => {
  test('ocupación externa bloquea sin consumir saldo ni confirmar; liberada, confirma y encola un solo sync', async () => {
    const { c, connection } = await withConnection();
    const s = await proposed(c);
    fake.setBusy('primary', [{ start: new Date(s.startsAt).toISOString(), end: new Date(new Date(s.startsAt).getTime() + 600000).toISOString() }]);
    await expect(sessions.accept(c.students[0], s.id, 1)).rejects.toMatchObject({ code: 'schedule_conflict', params: { reason: 'external_busy' } });
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 4, reserved: 0 });
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('proposed');
    expect(await M.OutboxJob.count({ where: { topic: 'calendar.sync', aggregateId: s.id } })).toBe(0);

    fake.setBusy('primary', []);
    const done = await sessions.accept(c.students[0], s.id, 1);
    expect(done.status).toBe('confirmed');
    expect(fake.calls().freeBusy).toBe(2);
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ available: 3, reserved: 1 });
    expect((await syncJobs(s.id)).length).toBe(1);
    expect((await refOf(s.id))).toMatchObject({ status: 'pending', externalId: null });
    expect(connection.status).toBe('connected');
  });

  test('P2: pulsar «Reconectar» y abandonar no degrada la conexión: sigue exigiendo free/busy', async () => {
    for (const status of ['needs_attention', 'revoked']) {
      const { c, connection } = await withConnection();
      await connection.update({ status });
      await calendar.connect(c.teacher); // inicia OAuth y se abandona
      expect((await M.ExternalConnection.findByPk(connection.id)).status).toBe(status);
      const s = await proposed(c);
      await expect(sessions.accept(c.students[0], s.id, 1)).rejects.toMatchObject({ code: 'provider_unavailable', params: { reason: 'integration_needs_attention' } });
      expect((await M.ClassSession.findByPk(s.id)).status).toBe('proposed');
    }
    // Una conexión desconectada tampoco queda en pending al volver a empezar.
    const { c, connection } = await withConnection();
    await calendar.disconnect(c.teacher);
    await calendar.connect(c.teacher);
    expect((await M.ExternalConnection.findByPk(connection.id)).status).toBe('disconnected');
  });

  test('un fallo de lectura nunca confirma a ciegas: 503 recuperable y luego confirma', async () => {
    const { c } = await withConnection();
    const s = await proposed(c);
    fake.failNext('freeBusy', new IntegrationError(503, 'provider_unavailable', {}, { retryable: true }));
    await expect(sessions.accept(c.students[0], s.id, 1)).rejects.toMatchObject({ code: 'provider_unavailable', statusCode: 503, params: { reason: 'availability_check_failed' } });
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('proposed');
    expect((await sessions.accept(c.students[0], s.id, 1)).status).toBe('confirmed');
  });

  test('un tercero no puede sondear la agenda ajena y la lectura no ocurre dentro de la transacción', async () => {
    const { c } = await withConnection();
    const s = await proposed(c);
    const stranger = await createUser('student', 'cal-intruso');
    await expect(sessions.accept(stranger, s.id, 1)).rejects.toMatchObject({ code: 'not_found' });
    expect(fake.calls().freeBusy || 0).toBe(0);
  });

  test('reprogramar ignora el bloque del propio evento y respeta otros', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    await drain();
    const own = { start: s.startsAt.toISOString(), end: s.endsAt.toISOString() };
    fake.setBusy('primary', [own]);
    const later = { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '09:25') }; // se solapa con la clase vigente
    const p = await sessions.reschedule(c.teacher, s.id, { version: s.version, intent: later });
    const moved = await sessions.accept(c.students[0], s.id, p.version);
    expect(moved.status).toBe('confirmed');
    const next = await sessions.reschedule(c.teacher, s.id, { version: moved.version, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '15:00') } });
    const target = time.resolveLocalIntent({ localStart: c.body.intent.localStart.replace('09:00', '15:00'), timeZone: c.body.intent.timeZone, offset: c.body.intent.offset, minutes: 50 });
    fake.setBusy('primary', [{ start: target.startsAt, end: target.endsAt }]);
    await expect(sessions.accept(c.students[0], s.id, next.version)).rejects.toMatchObject({ code: 'schedule_conflict' });
  });

  test('sin conexión no se consulta y la confirmación funciona como en W06', async () => {
    const c = await chain();
    const s = await proposed(c);
    expect((await sessions.accept(c.students[0], s.id, 1)).status).toBe('confirmed');
    expect(fake.calls().freeBusy || 0).toBe(0);
    expect((await refOf(s.id)).status).toBe('needs_attention');
  });
});

describe('calendar.sync (CAL-02, CAL-04, CAL-05)', () => {
  test('crea el evento con privacidad, lo actualiza al reprogramar y lo cancela sin duplicar', async () => {
    const { c } = await withConnection({ size: 2 });
    const s = await confirmed(c);
    expect(await drain()).toBeGreaterThan(0);
    let ref = await refOf(s.id);
    expect(ref).toMatchObject({ status: 'ready', syncedVersion: s.version, calendarId: 'primary', lastError: null });
    expect(ref.externalId).toBe(sync.eventIdFor(ref.correlationKey));
    const [stored] = fake.events();
    expect(stored.startsAt).toBe(new Date(s.startsAt).toISOString());
    expect(stored.endsAt).toBe(new Date(s.endsAt).toISOString());
    expect(stored.attendees.sort()).toEqual(c.students.map(u => u.email).sort());
    expect(JSON.stringify(stored)).not.toMatch(/start_url|hostUrl|mensaje|message/i);
    expect(stored.description).not.toMatch(/zoom\.us\/s\//);
    expect(fake.eventCount('primary')).toBe(1);

    const p = await sessions.reschedule(c.teacher, s.id, { version: s.version, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '13:00') } });
    let current = p;
    for (const student of c.students) current = await sessions.accept(student, s.id, p.version);
    await drain();
    ref = await refOf(s.id);
    expect(fake.eventCount('primary')).toBe(1);
    expect(fake.events()[0].startsAt).toBe(new Date(current.startsAt).toISOString());
    expect(ref).toMatchObject({ status: 'ready', syncedVersion: current.version });

    await sessions.cancel(c.teacher, s.id, { version: current.version, reason: 'Imprevisto del docente' });
    await drain();
    expect(fake.eventCount('primary')).toBe(0);
    expect(await refOf(s.id)).toMatchObject({ status: 'cancelled' });
  });

  test('incluye solo el enlace de participante de Zoom cuando está listo', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    await M.ExternalSyncRef.update({ joinUrl: 'https://us02web.zoom.us/j/12345?pwd=abc', status: 'ready' }, { where: { sessionId: s.id, provider: 'zoom' } });
    await drain();
    expect(fake.events()[0].description).toContain('https://us02web.zoom.us/j/12345?pwd=abc');
  });

  test('timeout tras crear el evento: el reintento adopta el mismo evento (sin duplicar)', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    fake.loseResponseNext('insertEvent', new IntegrationError(503, 'provider_unavailable', {}, { retryable: true }));
    await outbox.runOnce({ limit: 5 });
    expect(fake.eventCount('primary')).toBe(1);
    expect(await refOf(s.id)).toMatchObject({ status: 'pending', externalId: null, attempts: 1 });
    await drain(new Date(Date.now() + 3600e3));
    expect(fake.eventCount('primary')).toBe(1);
    expect(await refOf(s.id)).toMatchObject({ status: 'ready', lastError: null });
  });

  test('dos réplicas sincronizando la misma sesión producen un solo evento', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    fake.setDelay(40);
    await Promise.all([sync.syncSession(s.id), sync.syncSession(s.id), sync.syncSession(s.id)]);
    expect(fake.eventCount('primary')).toBe(1);
    expect((await refOf(s.id)).status).toBe('ready');
  });

  test('agotados los reintentos queda accionable en needs_attention y el reintento del docente lo resuelve', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    const job = (await syncJobs(s.id))[0];
    await job.update({ maxAttempts: 1 });
    fake.failNext('insertEvent', new IntegrationError(503, 'provider_unavailable', {}, { retryable: true }));
    await outbox.runOnce({ limit: 5 });
    expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention', lastError: 'sync_failed' });
    expect((await M.OutboxJob.findByPk(job.id)).status).toBe('failed');
    const retried = await as(c.teacher).post(`/api/class-sessions/${s.id}/sync/retry`);
    expect(retried.status).toBe(200);
    await drain();
    expect(await refOf(s.id)).toMatchObject({ status: 'ready' });
    expect(fake.eventCount('primary')).toBe(1);
  });

  test('el estado de sincronización es visible en el detalle de la sesión', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    await drain();
    const detail = (await as(c.students[0]).get(`/api/class-sessions/${s.id}`)).body;
    expect(detail.sync.find(r => r.provider === 'google_calendar')).toMatchObject({ status: 'ready' });
  });
});

describe('recuperación (AC15, CAL-06, CAL-07, CAL-08)', () => {
  test('revocación en Google: needs_attention con aviso, no se confirma a ciegas y reconectar no duplica', async () => {
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    await drain();
    expect(fake.eventCount('primary')).toBe(1);
    // El docente cambia la clase pero Google ya revocó la autorización.
    const p = await sessions.reschedule(c.teacher, s.id, { version: s.version, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '14:00') } });
    const moved = await sessions.accept(c.students[0], s.id, p.version);
    fake.revokeAuthorization();
    await M.ExternalConnection.update({ tokenExpiresAt: new Date(0) }, { where: { id: connection.id } });
    const { encrypt, decrypt } = require('../src/services/liveGoogleService');
    const row = await M.ExternalConnection.findByPk(connection.id);
    await row.update({ credentials: encrypt({ ...decrypt(row.credentials), expiresAt: 0 }) });
    await drain();
    expect(await M.ExternalConnection.findByPk(connection.id)).toMatchObject({ status: 'revoked', lastError: 'authorization_revoked' });
    expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention', lastError: 'authorization_lost' });
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('confirmed'); // la clase y el saldo siguen intactos
    expect(await credits.balance(c.purchases[0].id)).toMatchObject({ reserved: 1 });
    // No se confirman nuevas clases sin leer la ocupación.
    const other = await sessions.create(c.teacher, { ...c.body, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '18:00') } }, uuid());
    await expect(sessions.accept(c.students[0], other.session.id, 1)).rejects.toMatchObject({ code: 'provider_unavailable', params: { reason: 'integration_needs_attention' } });

    fake.revokeAuthorization(false);
    await connect(c.teacher);
    await drain();
    expect(await refOf(s.id)).toMatchObject({ status: 'ready', syncedVersion: moved.version });
    expect(fake.eventCount('primary')).toBe(1);
    expect(fake.events()[0].startsAt).toBe(new Date(moved.startsAt).toISOString());
  });

  test('evento movido o borrado desde Google: avisa, no mueve la clase y se resuelve desde la app', async () => {
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    await drain();
    const ref = await refOf(s.id);
    const original = (await M.ClassSession.findByPk(s.id)).startsAt.toISOString();
    fake.editExternally('primary', ref.externalId, { startsAt: '2031-01-01T10:00:00.000Z', endsAt: '2031-01-01T10:50:00.000Z' });
    await sync.reconcile(connection.id);
    expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention', lastError: 'external_changed' });
    expect((await M.ClassSession.findByPk(s.id)).startsAt.toISOString()).toBe(original);
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('confirmed');
    expect((await as(c.teacher).get(`/api/class-sessions/${s.id}`)).body.sync[0]).toMatchObject({ status: 'needs_attention' });

    await as(c.teacher).post(`/api/class-sessions/${s.id}/sync/retry`);
    await drain();
    expect(fake.events()[0].startsAt).toBe(original);
    expect(await refOf(s.id)).toMatchObject({ status: 'ready', lastError: null });

    fake.removeExternally('primary', ref.externalId);
    await sync.reconcile(connection.id);
    expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention', lastError: 'external_deleted' });
    await sync.syncSession(s.id); // un job ordinario no recrea un evento que alguien borró a propósito
    expect(fake.eventCount('primary')).toBe(0);
    await as(c.teacher).post(`/api/class-sessions/${s.id}/sync/retry`);
    await drain();
    expect(fake.eventCount('primary')).toBe(1);
    expect(await refOf(s.id)).toMatchObject({ status: 'ready' });
  });

  test('notificaciones push: canal/token/recurso validados, anti-replay y sync incremental', async () => {
    process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL = 'https://api.example.test/api/integrations/google-calendar/notifications';
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    await drain();
    await sync.reconcile(connection.id);
    const [watch] = fake.channels();
    expect(watch).toMatchObject({ address: process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL, calendarId: 'primary' });
    const channel = await M.ExternalCalendarChannel.findOne({ where: { connectionId: connection.id } });
    expect(channel.tokenHash).toBe(connections.sha256(watch.token));
    expect(JSON.stringify(channel)).not.toContain(watch.token);
    const request = require('supertest')(require('../src/app'));
    const post = (headers) => request.post('/api/integrations/google-calendar/notifications').set(headers);
    const good = n => ({ 'X-Goog-Channel-ID': watch.channelId, 'X-Goog-Channel-Token': watch.token, 'X-Goog-Resource-ID': watch.resourceId, 'X-Goog-Resource-State': 'exists', 'X-Goog-Message-Number': String(n) });
    expect((await post({ ...good(1), 'X-Goog-Channel-Token': 'otro' })).status).toBe(404);
    expect((await post({ ...good(1), 'X-Goog-Resource-ID': 'otro' })).status).toBe(404);
    expect((await post({ ...good(1), 'X-Goog-Channel-ID': 'desconocido' })).status).toBe(404);
    expect((await post({})).status).toBe(404);
    expect((await post({ ...good(1), 'X-Goog-Resource-State': 'sync' })).status).toBe(200);
    expect(await M.OutboxJob.count({ where: { topic: 'calendar.reconcile', dedupeKey: { [require('sequelize').Op.like]: '%:push:%' } } })).toBe(0);
    fake.editExternally('primary', (await refOf(s.id)).externalId, { startsAt: '2031-02-01T10:00:00.000Z', endsAt: '2031-02-01T10:50:00.000Z' });
    expect((await post(good(2))).status).toBe(200);
    expect((await post(good(2))).status).toBe(200); // repetida: no se encola otra vez
    expect((await post(good(1))).status).toBe(200); // desordenada/vieja: ignorada
    expect(await M.OutboxJob.count({ where: { topic: 'calendar.reconcile', dedupeKey: { [require('sequelize').Op.like]: `calendar.reconcile:${connection.id}:push:%` } } })).toBe(1);
    await drain();
    expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention', lastError: 'external_changed' });
  });

  test('token de sync vencido (410) resincroniza sin borrar sesiones ni duplicar eventos', async () => {
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    await drain();
    await sync.reconcile(connection.id);
    await M.ExternalCalendarChannel.update({ syncToken: 'expired' }, { where: { connectionId: connection.id } });
    await sync.reconcile(connection.id);
    const channel = await M.ExternalCalendarChannel.findOne({ where: { connectionId: connection.id } });
    expect(channel.syncToken).toMatch(/^fake-sync-/);
    expect(fake.eventCount('primary')).toBe(1);
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('confirmed');
    expect((await refOf(s.id)).status).toBe('ready');
  });

  test('el sondeo es una cadena durable: cada tick programa el siguiente una sola vez', async () => {
    const { connection } = await withConnection();
    const ticks = () => M.OutboxJob.count({ where: { topic: 'calendar.reconcile', aggregateId: connection.id, status: 'pending' } });
    expect(await ticks()).toBe(1);
    await calendar.scheduleTick(connection.id);
    expect(await ticks()).toBe(1);
    await drain(new Date(Date.now() + 3600e3));
    expect(await ticks()).toBeLessThanOrEqual(1);
    expect(await M.OutboxJob.count({ where: { topic: 'calendar.reconcile', aggregateId: connection.id, status: 'done' } })).toBe(1);
  });

  test('desconectar deja sesiones, saldo e historial; detiene futuras actualizaciones y reconectar reanuda sin duplicar', async () => {
    const { c } = await withConnection();
    const s = await confirmed(c);
    await drain();
    await as(c.teacher).delete('/api/integrations/google-calendar');
    expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention', lastError: 'integration_not_connected' });
    expect((await M.ClassSession.findByPk(s.id)).status).toBe('confirmed');
    expect(fake.eventCount('primary')).toBe(1); // el evento ya creado no se toca
    const detail = (await as(c.teacher).get(`/api/class-sessions/${s.id}`)).body;
    expect(detail.sync[0].status).toBe('needs_attention');
    // Sin conexión no se consulta free/busy y la agenda sigue funcionando.
    const other = await sessions.create(c.teacher, { ...c.body, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '18:00') } }, uuid());
    expect((await sessions.accept(c.students[0], other.session.id, 1)).status).toBe('confirmed');
    await connect(c.teacher);
    await drain();
    expect(fake.eventCount('primary')).toBe(2);
    expect(await refOf(s.id)).toMatchObject({ status: 'ready' });
  });
});

describe('ICS para el alumno (CAL-05)', () => {
  test('UID estable, SEQUENCE por versión, UTC, sin invitados y solo para participantes', async () => {
    const c = await chain();
    const s = await confirmed(c);
    const get = (user, id = s.id) => as(user).get(`/api/class-sessions/${id}/calendar.ics`);
    const first = await get(c.students[0]);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toMatch(/text\/calendar/);
    expect(first.headers['content-disposition']).toContain('.ics');
    const text = first.text;
    expect(text).toContain(`UID:class-session-${s.id}@localhost`);
    expect(text).toContain(`SEQUENCE:${s.version}`);
    expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(text).toContain('STATUS:CONFIRMED');
    expect(text).not.toMatch(/ATTENDEE|ORGANIZER|mailto/i);
    expect(text).toMatch(/no garantiza/);
    const p = await sessions.reschedule(c.teacher, s.id, { version: s.version, intent: { ...c.body.intent, localStart: c.body.intent.localStart.replace('09:00', '16:00') } });
    await sessions.accept(c.students[0], s.id, p.version);
    const second = (await get(c.students[0])).text;
    expect(second).toContain(`UID:class-session-${s.id}@localhost`);
    expect(second).toContain(`SEQUENCE:${p.version}`);
    expect(second).not.toBe(text);
    expect((await get(c.teacher)).status).toBe(200);
    expect((await get(await createUser('student', 'ics-ajeno'))).status).toBe(404);
    const pending = await proposed(await chain());
    expect((await get(c.students[0], pending.id)).status).toBe(404);
    await sessions.cancel(c.teacher, s.id, { version: p.version, reason: 'Imprevisto del docente' });
    const cancelled = (await get(c.students[0])).text;
    expect(cancelled).toContain('STATUS:CANCELLED');
    expect(Number(cancelled.match(/SEQUENCE:(\d+)/)[1])).toBeGreaterThan(p.version);
  });
});

describe('P3 de la revisión cruzada', () => {
  test('el scope de eventos es solo de calendarios propios y el destino debe ser owner', async () => {
    const { SCOPES } = require('../src/services/googleCalendar');
    expect(SCOPES).toContain('https://www.googleapis.com/auth/calendar.events.owned');
    expect(SCOPES).not.toContain('https://www.googleapis.com/auth/calendar.events');
    const teacher = await createUser('teacher', 'cal-owner');
    await connect(teacher);
    const writer = { id: 'equipo@example.test', summary: 'Equipo', primary: false, accessRole: 'writer' };
    fake.addCalendar(writer);
    const patch = body => require('supertest')(require('../src/app')).patch('/api/integrations/google-calendar').set('Authorization', `Bearer ${teacher.token}`).send(body);
    expect((await patch({ targetCalendarId: writer.id })).status).toBe(400);
    expect((await patch({ targetCalendarId: 'clases@example.test' })).status).toBe(200);
  });

  test('los canales push viejos se detienen al cambiar la URL, quitarla o cambiar el calendario destino', async () => {
    process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL = 'https://api.example.test/a/notifications';
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    await drain();
    await sync.reconcile(connection.id);
    const [first] = fake.channels();
    expect(first.address).toBe('https://api.example.test/a/notifications');
    // Cambia la URL: se crea el canal nuevo y se detiene el anterior.
    process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL = 'https://api.example.test/b/notifications';
    await sync.reconcile(connection.id);
    expect(fake.channels().map(ch => ch.address)).toEqual(['https://api.example.test/b/notifications']);
    expect(fake.calls().stopChannel).toBe(1);
    // Se quita la variable: se detiene el canal y se sigue por sondeo.
    delete process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL;
    await sync.reconcile(connection.id);
    expect(fake.channels()).toEqual([]);
    const row = await M.ExternalCalendarChannel.findOne({ where: { connectionId: connection.id } });
    expect(row).toMatchObject({ channelId: null, resourceId: null, tokenHash: null, address: null });
    expect(row.syncToken).toMatch(/^fake-sync-/);
    // Cambia el calendario destino y ya no hay eventos en el viejo: el canal del calendario sin uso se detiene.
    process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL = 'https://api.example.test/b/notifications';
    await sync.reconcile(connection.id);
    expect(fake.channels().map(ch => ch.calendarId)).toEqual(['primary']);
    await M.ExternalSyncRef.update({ status: 'cancelled' }, { where: { sessionId: s.id } });
    await M.ExternalConnection.update({ targetCalendarId: 'clases@example.test' }, { where: { id: connection.id } });
    await sync.reconcile(connection.id);
    expect(fake.channels().map(ch => ch.calendarId)).toEqual(['clases@example.test']);
    expect(await M.ExternalCalendarChannel.count({ where: { connectionId: connection.id, calendarId: 'primary' } })).toBe(0);
  });

  test('una clave de cifrado rotada deja la conexión en needs_attention en vez de fallar sin aviso', async () => {
    const { c, connection } = await withConnection();
    const s = await confirmed(c);
    const original = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    const { encrypt, decrypt } = require('../src/services/liveGoogleService');
    const row = await M.ExternalConnection.findByPk(connection.id);
    await row.update({ credentials: encrypt({ ...decrypt(row.credentials), expiresAt: 0 }) });
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64'); // rotada: ya no descifra
    try {
      await drain();
      expect(await M.ExternalConnection.findByPk(connection.id)).toMatchObject({ status: 'needs_attention', lastError: 'authorization_lost' });
      expect(await refOf(s.id)).toMatchObject({ status: 'needs_attention' });
      await expect(connections.accessToken(connection.id, () => {})).rejects.toMatchObject({ code: 'integration_not_connected' });
    } finally { process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = original; }
  });
});
