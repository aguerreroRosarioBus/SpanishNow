const request = require('supertest');
const { app, as, createUser } = require('./helpers/fixtures');
const { User, ClassSession } = require('../src/models');
const { isTimeZone } = require('../src/services/userPreferences');

const patch = (user, body) => request(app).patch('/api/me/preferences')
  .set('Authorization', `Bearer ${user.token}`).send(body);

describe('W01: preferencias propias de idioma y zona', () => {
  test('requiere autenticación para leer y escribir; cuentas suspendidas no acceden', async () => {
    expect((await request(app).get('/api/me/preferences')).status).toBe(401);
    expect((await request(app).patch('/api/me/preferences').send({ locale: 'es' })).status).toBe(401);
    const user = await createUser('student', 'pref-suspended');
    await user.update({ suspendedAt: new Date() });
    expect((await as(user).get('/api/me/preferences')).status).toBe(401);
    expect((await patch(user, { locale: 'es' })).status).toBe(401);
  });

  test.each(['student', 'teacher'])('devuelve solo las tres preferencias de %s y conserva null sin elegir', async role => {
    const user = await createUser(role, 'pref-null');
    const response = await as(user).get('/api/me/preferences');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ locale: null, timeZone: null, timeZoneConfirmedAt: null });
  });

  test('idioma y zona se actualizan por separado, sin modificar permisos ni sesiones confirmadas', async () => {
    const user = await createUser('teacher', 'pref-independent');
    await user.update({ permissions: ['users.manage'] });
    const session = await ClassSession.create({
      teacherId: user.id, kind: 'individual', status: 'confirmed', version: 1, minutes: 50,
      startsAt: new Date('2026-10-22T13:00:00Z'), endsAt: new Date('2026-10-22T13:50:00Z'),
      timeZone: 'America/New_York', localStart: '2026-10-22T09:00', utcOffset: '-04:00', disambiguation: 'none'
    });
    const zone = await patch(user, { timeZone: 'America/Argentina/Cordoba', confirmTimeZone: true });
    expect(zone.status).toBe(200);
    expect(zone.body).toMatchObject({ locale: null, timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: expect.stringMatching(/Z$/) });
    const confirmedAt = zone.body.timeZoneConfirmedAt;
    const language = await patch(user, { locale: 'es' });
    expect(language.status).toBe(200);
    expect(language.body).toEqual({ locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: confirmedAt });
    expect((await user.reload()).permissions).toEqual(['users.manage']);
    expect((await session.reload()).startsAt.toISOString()).toBe('2026-10-22T13:00:00.000Z');
    expect(session.endsAt.toISOString()).toBe('2026-10-22T13:50:00.000Z');
    expect(session.timeZone).toBe('America/New_York');
    const repeated = await patch(user, { confirmTimeZone: true });
    expect(repeated.body.timeZoneConfirmedAt).toBe(confirmedAt);
  });

  test('zona nueva sin confirmación explícita invalida la confirmación anterior; el navegador no decide por el usuario', async () => {
    const user = await createUser('student', 'pref-confirm');
    const none = await patch(user, { confirmTimeZone: true });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('time_zone_invalid');
    await patch(user, { timeZone: 'America/New_York', confirmTimeZone: true });
    const pending = await patch(user, { timeZone: 'Europe/London', confirmTimeZone: false });
    expect(pending.body).toMatchObject({ timeZone: 'Europe/London', timeZoneConfirmedAt: null });
    const confirmed = await patch(user, { confirmTimeZone: true });
    expect(confirmed.body.timeZoneConfirmedAt).toEqual(expect.any(String));
  });

  test.each(['UTC', 'America/Argentina/Cordoba', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Kathmandu', 'US/Eastern'])(
    'acepta zona IANA o alias %s sin resolver horarios locales', zone => { expect(isTimeZone(zone)).toBe(true); }
  );

  test.each(['EST', 'CST', 'UTC-3', 'GMT+3', '+03:00', 'Argentina', 'America/no-existe', '', null, 3, ' Europe/London'])(
    'rechaza zona inválida o ambigua %s y no aplica idioma parcial', async zone => {
      const user = await createUser('student', 'pref-invalid-zone');
      const response = await patch(user, { locale: 'es', timeZone: zone });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: expect.any(String), code: 'time_zone_invalid', params: { fields: ['timeZone'] } });
      expect((await user.reload()).locale).toBeNull();
    }
  );

  test.each([{}, [], { locale: 'fr' }, { locale: null }, { locale: ['es'] }, { confirmTimeZone: 'true' }, { role: 'teacher' }, { timeZoneConfirmedAt: '2026-10-22T13:00:00Z' }])(
    'rechaza cuerpo no permitido sin mass assignment: %j', async body => {
      const user = await createUser('student', 'pref-invalid');
      const response = await patch(user, body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'validation_failed', params: { fields: expect.any(Array) } });
      expect((await user.reload()).role).toBe('student');
    }
  );

  test('no permite seleccionar otra cuenta por payload o parámetros', async () => {
    const user = await createUser('student', 'pref-owner');
    const other = await createUser('student', 'pref-other');
    expect((await patch(user, { locale: 'es', userId: other.id })).status).toBe(400);
    const own = await request(app).patch(`/api/me/preferences?userId=${other.id}`)
      .set('Authorization', `Bearer ${user.token}`).send({ locale: 'es' });
    expect(own.status).toBe(200);
    expect((await user.reload()).locale).toBe('es');
    expect((await other.reload()).locale).toBeNull();
  });

  test('PATCH concurrentes de idioma y zona no pierden la actualización del otro campo', async () => {
    const user = await createUser('student', 'pref-concurrent');
    const results = await Promise.all([
      patch(user, { locale: 'es' }),
      patch(user, { timeZone: 'Asia/Kathmandu', confirmTimeZone: true })
    ]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    const saved = (await as(user).get('/api/me/preferences')).body;
    expect(saved).toMatchObject({ locale: 'es', timeZone: 'Asia/Kathmandu', timeZoneConfirmedAt: expect.any(String) });
    expect((await User.findByPk(user.id)).role).toBe('student');
  });
});
