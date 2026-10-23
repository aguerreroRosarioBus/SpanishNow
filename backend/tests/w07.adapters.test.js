// W07 · reglas puras: ICS, id determinista del evento y adaptador real contra un fetch simulado (sin red ni cuentas).
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'; process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
const { buildIcs } = require('../src/services/calendarIcs');
const { eventIdFor } = require('../src/services/googleCalendarSync');
const live = require('../src/services/googleCalendar/live');
const { SCOPES } = require('../src/services/googleCalendar');
const features = require('../src/config/features');
const M = require('../src/models');
const { deleteTestUser } = require('../src/services/adminUsers');
const { createUser } = require('./helpers/fixtures');
const outbox = require('../src/services/outbox');

describe('ICS', () => {
  const session = { id: 42, version: 3, status: 'confirmed', startsAt: new Date('2026-11-02T13:00:00Z'), endsAt: new Date('2026-11-02T13:50:00Z'), updatedAt: new Date('2026-10-30T10:00:00Z') };
  test('UID estable, SEQUENCE = versión, UTC, líneas plegadas y texto escapado', () => {
    const text = buildIcs({ session, host: 'spanishnow.test', url: 'https://spanishnow.test/schedule', zoomJoinUrl: 'https://zoom.us/j/1?pwd=' + 'a'.repeat(120) });
    expect(text).toContain('UID:class-session-42@spanishnow.test\r\n');
    expect(text).toContain('SEQUENCE:3\r\n');
    expect(text).toContain('DTSTART:20261102T130000Z\r\n');
    expect(text).toContain('DTEND:20261102T135000Z\r\n');
    expect(text).toContain('STATUS:CONFIRMED');
    expect(text.split('\r\n').every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(text).toContain('\\n\\n'); // saltos escapados dentro de DESCRIPTION
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(buildIcs({ session: { ...session, version: 4 }, host: 'spanishnow.test' })).toContain('UID:class-session-42@spanishnow.test');
    const cancelled = buildIcs({ session: { ...session, status: 'cancelled' }, locale: 'en' });
    expect(cancelled).toContain('STATUS:CANCELLED');
    expect(cancelled).toContain('SUMMARY:Spanish class');
  });
  test('el id de evento es determinista, válido para Google (base32hex) y distinto por sesión', () => {
    const a = eventIdFor('google_calendar:session:1');
    expect(a).toBe(eventIdFor('google_calendar:session:1'));
    expect(a).toMatch(/^[0-9a-v]{25}$/);
    expect(eventIdFor('google_calendar:session:2')).not.toBe(a);
  });
});

describe('adaptador real (fetch simulado)', () => {
  let calls;
  const respond = (status, body = {}) => ({ ok: status < 300, status, json: async () => body, clone() { return this; } });
  const mockFetch = (...responses) => { calls = []; global.fetch = jest.fn(async (url, options) => { calls.push({ url: String(url), options }); return responses.shift() || respond(200); }); };
  afterEach(() => { delete global.fetch; });

  test('la URL de autorización pide solo permisos de Calendar, PKCE S256 y no mezcla Drive/Classroom', () => {
    const url = new URL(live.authUrl({ state: 's'.repeat(43), challenge: 'c'.repeat(43) }));
    expect(url.searchParams.get('scope').split(' ')).toEqual(SCOPES);
    expect(SCOPES.join(' ')).not.toMatch(/drive|classroom/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('include_granted_scopes')).toBe('false');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/integrations/google-calendar/callback');
  });

  test('el evento oculta invitados, impide invitar/modificar y no lleva datos privados', async () => {
    mockFetch(respond(200, { id: 'abc', etag: '"1"', status: 'confirmed', start: { dateTime: '2026-11-02T13:00:00Z' }, end: { dateTime: '2026-11-02T13:50:00Z' } }));
    const event = await live.insertEvent('token', 'primary', { id: 'abc', summary: 'Clase', description: 'd', startsAt: '2026-11-02T13:00:00.000Z', endsAt: '2026-11-02T13:50:00.000Z',
      attendees: ['alumno@example.test'], correlationKey: 'google_calendar:session:1', sessionId: 1, version: 2 });
    const body = JSON.parse(calls[0].options.body);
    expect(calls[0].url).toContain('/calendars/primary/events?sendUpdates=all');
    expect(body).toMatchObject({ id: 'abc', guestsCanSeeOtherGuests: false, guestsCanInviteOthers: false, guestsCanModify: false,
      extendedProperties: { private: { spanishnowKey: 'google_calendar:session:1' } }, attendees: [{ email: 'alumno@example.test' }] });
    expect(calls[0].options.headers.Authorization).toBe('Bearer token');
    expect(event).toMatchObject({ id: 'abc', etag: '"1"', startsAt: '2026-11-02T13:00:00.000Z', cancelled: false });
  });

  test('clasificación de errores: 401 revoca, 429/5xx reintentan, 409 existe, 410 sync vencido, 404 en delete es éxito', async () => {
    mockFetch(respond(401)); await expect(live.listCalendars('t')).rejects.toMatchObject({ code: 'authorization_revoked', needsAttention: true });
    mockFetch(respond(503)); await expect(live.listCalendars('t')).rejects.toMatchObject({ retryable: true });
    mockFetch(respond(429)); await expect(live.listCalendars('t')).rejects.toMatchObject({ retryable: true });
    mockFetch(respond(409)); await expect(live.insertEvent('t', 'primary', { id: 'x', correlationKey: 'k', sessionId: 1, version: 1 })).rejects.toMatchObject({ code: 'event_exists' });
    mockFetch(respond(410)); await expect(live.listChanges('t', 'primary', 'tok')).rejects.toMatchObject({ code: 'sync_token_expired' });
    mockFetch(respond(404)); await expect(live.deleteEvent('t', 'primary', 'x')).resolves.toBeUndefined();
    mockFetch(respond(404)); expect(await live.getEvent('t', 'primary', 'x')).toBeNull();
    global.fetch = jest.fn(async () => { throw new Error('timeout'); });
    await expect(live.listCalendars('t')).rejects.toMatchObject({ retryable: true });
  });

  test('refresh con invalid_grant exige reconectar; free/busy incompleto no cuenta como libre', async () => {
    mockFetch(respond(400, { error: 'invalid_grant' })); await expect(live.refresh('r')).rejects.toMatchObject({ code: 'authorization_revoked', needsAttention: true });
    mockFetch(respond(200, { calendars: { primary: { busy: [{ start: 'a', end: 'b' }] }, other: { errors: [{ reason: 'notFound' }] } } }));
    await expect(live.freeBusy('t', { calendarIds: ['primary', 'other'], timeMin: 'x', timeMax: 'y' })).rejects.toMatchObject({ retryable: true });
    mockFetch(respond(200, { calendars: { primary: { busy: [{ start: 'a', end: 'b', extra: 'titulo' }] } } }));
    expect(await live.freeBusy('t', { calendarIds: ['primary'], timeMin: 'x', timeMax: 'y' })).toEqual([{ start: 'a', end: 'b' }]);
  });

  test('exige los permisos pedidos: sin refresh token o sin alguno de los scopes no se conecta', async () => {
    mockFetch(respond(200, { access_token: 'a', refresh_token: 'r', scope: SCOPES.slice(0, 2).join(' '), expires_in: 3600 }));
    await expect(live.exchangeCode({ code: 'c', verifier: 'v' })).rejects.toMatchObject({ code: 'oauth_scopes_missing' });
  });

  test('el modo fake queda prohibido en producción', () => {
    const env = { ...process.env };
    process.env.INTEGRATIONS_FAKE = '1'; process.env.NODE_ENV = 'production';
    expect(() => features.assertSafe()).toThrow(/INTEGRATIONS_FAKE/);
    process.env.NODE_ENV = env.NODE_ENV; delete process.env.INTEGRATIONS_FAKE;
  });
});

describe('limpieza de cuentas de prueba', () => {
  test('borrar un docente de prueba retira su conexión, canales y jobs de sondeo', async () => {
    const teacher = await createUser('teacher', 'cal-limpieza');
    await teacher.update({ isTestAccount: true });
    const connection = await M.ExternalConnection.create({ userId: teacher.id, provider: 'google_calendar', status: 'connected' });
    await M.ExternalCalendarChannel.create({ connectionId: connection.id, calendarId: 'primary' });
    await outbox.enqueue({ topic: 'calendar.reconcile', aggregateType: 'external_connections', aggregateId: connection.id, dedupeKey: `calendar.reconcile:${connection.id}:tick:1` });
    await deleteTestUser(teacher.id);
    expect(await M.ExternalConnection.count({ where: { userId: teacher.id } })).toBe(0);
    expect(await M.ExternalCalendarChannel.count({ where: { connectionId: connection.id } })).toBe(0);
    expect(await M.OutboxJob.count({ where: { aggregateType: 'external_connections', aggregateId: connection.id } })).toBe(0);
  });
});
