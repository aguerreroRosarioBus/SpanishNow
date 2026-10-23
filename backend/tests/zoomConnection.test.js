const request = require('supertest');
const app = require('../src/app');
const M = require('../src/models');
const { chain } = require('./helpers/classSessions');
const { as } = require('./helpers/fixtures');
const c = require('../src/services/zoomConnection');
const cipher = require('../src/services/liveGoogleService');
const adapter = require('../src/services/zoomAdapter');
beforeAll(() => {
  process.env.FEATURE_ZOOM = '1'; process.env.INTEGRATIONS_FAKE = '1';
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
});
afterAll(() => { delete process.env.FEATURE_ZOOM; delete process.env.INTEGRATIONS_FAKE; });
const { connected } = require('./zoomFixtures');
test('OAuth fake por docente, cifrado, state de un uso, confirmación autenticada, perfil sin credenciales', async () => {
  const fixture = await chain(); const t = fixture.teacher;
  const { agent, url } = await connected(t);
  const row = await c.rowFor(t.id);
  expect(row.credentials).not.toContain('fake-access'); expect(row.oauthVerifier).toBeNull();
  expect((await c.status(t))).toMatchObject({ status: 'connected', fake: true, capabilities: { maxMinutes: 120 } });
  expect(JSON.stringify(await c.status(t))).not.toMatch(/accessToken|refreshToken|verifier/);
  expect((await agent.get(url.pathname + url.search)).status).toBe(400);
  const start = await c.connect(t);
  expect((await request(app).get('/api/integrations/zoom/callback').query({ state: new URL(start.url).searchParams.get('state'), code: 'fake' })).status).toBe(400);
  expect((await as(fixture.students[0]).post('/api/integrations/zoom/connect')).status).toBe(403);
});
test('refresh serializado guarda rotación y desconectar conserva agenda y Calendar', async () => {
  const { teacher } = await chain(); await connected(teacher);
  const row = await c.rowFor(teacher.id); await row.update({ tokenExpiresAt: new Date(0) });
  const refresh = jest.spyOn(adapter, 'refresh');
  const results = await Promise.allSettled([c.credentials(teacher.id), c.credentials(teacher.id)]);
  expect(results.some(r => r.status === 'fulfilled')).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(1); refresh.mockRestore();
  const current = await c.rowFor(teacher.id);
  expect(cipher.decrypt(current.credentials).rotation).toBe(1);
  const calendar = await M.ExternalConnection.create({ userId: teacher.id, provider: 'google_calendar', status: 'connected' });
  await c.disconnect(teacher); expect((await c.rowFor(teacher.id)).credentials).toBeNull();
  await calendar.reload(); expect(calendar.status).toBe('connected');
});
test('flag y modo fake fallan cerrados, OAuth caducado y código manipulado se rechazan', async () => {
  const { teacher } = await chain(); const start = await c.connect(teacher);
  const state = new URL(start.url).searchParams.get('state');
  await (await c.rowFor(teacher.id)).update({ oauthExpiresAt: new Date(0) });
  expect((await request(app).get('/api/integrations/zoom/callback').query({ state })).status).toBe(400);
  process.env.FEATURE_ZOOM = '0';
  expect((await as(teacher).post('/api/integrations/zoom/connect')).body.code).toBe('feature_disabled');
  process.env.FEATURE_ZOOM = '1'; process.env.INTEGRATIONS_FAKE = '0';
  await expect(c.connect(teacher)).rejects.toMatchObject({ code: 'zoom_fake_required' });
  process.env.INTEGRATIONS_FAKE = '1';
});

test('PKCE fake rechaza canje con verificador ajeno y la impersonación no inicia OAuth', async () => {
  const { teacher } = await chain(); const start = await c.connect(teacher); const agent = request.agent(app);
  const url = new URL(start.url); const row = await c.rowFor(teacher.id); const pending = cipher.decrypt(row.oauthVerifier);
  await expect(adapter.authorize({ code: pending.code, expectedCode: pending.code, accountId: pending.accountId, verifier: 'interceptado' })).rejects.toMatchObject({ code: 'zoom_oauth_invalid' });
  expect((await agent.get(url.pathname + url.search)).status).toBe(302);
  const jwt = require('jsonwebtoken').sign({ id: teacher.id, role: 'teacher', impersonatedBy: 999 }, process.env.JWT_SECRET);
  expect((await request(app).post('/api/integrations/zoom/connect').set('Authorization', `Bearer ${jwt}`)).status).toBe(403);
});
test('revocación de refresh no expone ni conserva credenciales vencidas', async () => {
  const { teacher } = await chain(); await connected(teacher); const row = await c.rowFor(teacher.id);
  const tokens = cipher.decrypt(row.credentials); tokens.refreshToken = 'revocado';
  await row.update({ credentials: cipher.encrypt(tokens), tokenExpiresAt: new Date(0) });
  expect(await c.status(teacher)).toMatchObject({ status: 'revoked', capabilities: null, lastError: 'zoom_revoked' });
  expect((await c.rowFor(teacher.id)).credentials).toBeNull();
});

test('P1: A inicia y B completa: se descarta el grant pendiente, A sin credenciales y B sin acceso', async () => {
  const { teacher: a } = await chain(); const { teacher: b } = await chain();
  const start = await c.connect(a); const url = new URL(start.url);
  const callback = await request(app).get(url.pathname + url.search);
  expect(callback.status).toBe(302);
  const token = new URL(callback.headers.location).searchParams.get('token');
  expect((await c.rowFor(a.id)).credentials).toBeNull();
  expect((await as(b).post('/api/integrations/zoom/complete').send({ token })).status).toBe(403);
  expect((await c.rowFor(a.id)).credentials).toBeNull();
  expect(await c.rowFor(b.id)).toBeNull();
  expect((await as(a).post('/api/integrations/zoom/complete').send({ token })).status).toBe(400);
  // Reconectar desde una conexión existente y fallar la confirmación no modifica el grant previo.
  await connected(a); const previous = (await c.rowFor(a.id)).credentials;
  const next = new URL((await c.connect(a)).url);
  const result = await request(app).get(next.pathname + next.search);
  const another = new URL(result.headers.location).searchParams.get('token');
  expect((await as(b).post('/api/integrations/zoom/complete').send({ token: another })).status).toBe(403);
  expect((await c.rowFor(a.id)).credentials).toBe(previous);
});

test('P2: clave rotada devuelve estado needs_attention sin 500 y código traducible', async () => {
  const { teacher } = await chain(); await connected(teacher);
  const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
  try {
    const response = await as(teacher).get('/api/integrations/zoom');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'needs_attention', lastError: 'zoom_authorization_lost', capabilities: null });
    expect(JSON.stringify(response.body)).not.toMatch(/accessToken|refreshToken|credentials/);
    expect((await c.rowFor(teacher.id)).refreshLockedUntil).toBeNull();
  } finally { process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey; }
});

test('P3: guarda refresh rotado con lease propio aunque connect cambie la versión', async () => {
  const { teacher } = await chain(); await connected(teacher);
  const row = await c.rowFor(teacher.id); const original = cipher.decrypt(row.credentials);
  await row.update({ tokenExpiresAt: new Date(0) }); const refresh = adapter.refresh;
  const spy = jest.spyOn(adapter, 'refresh').mockImplementationOnce(async tokens => {
    const next = await refresh(tokens);
    await c.connect(teacher); // cambia la versión, mantiene el mismo grant y lease
    return next;
  });
  try {
    const { tokens } = await c.credentials(teacher.id);
    expect(tokens.rotation).toBe(1); expect(tokens.refreshToken).not.toBe(original.refreshToken);
    const current = await c.rowFor(teacher.id);
    expect(cipher.decrypt(current.credentials).refreshToken).toBe(tokens.refreshToken);
    expect(current.refreshLockedUntil).toBeNull(); expect(current.oauthVerifier).not.toBeNull();
  } finally { spy.mockRestore(); }
});
test('P3: refresh tardío no resucita un grant desconectado o reemplazado', async () => {
  const { teacher } = await chain(); await connected(teacher);
  await (await c.rowFor(teacher.id)).update({ tokenExpiresAt: new Date(0) }); const refresh = adapter.refresh;
  const spy = jest.spyOn(adapter, 'refresh').mockImplementationOnce(async tokens => {
    const next = await refresh(tokens); await c.disconnect(teacher); return next;
  });
  try { await expect(c.credentials(teacher.id)).rejects.toMatchObject({ code: 'integration_not_connected' }); }
  finally { spy.mockRestore(); }
  expect((await c.rowFor(teacher.id)).credentials).toBeNull();
  await connected(teacher); await (await c.rowFor(teacher.id)).update({ tokenExpiresAt: new Date(0) });
  let replacement;
  const newer = jest.spyOn(adapter, 'refresh').mockImplementationOnce(async tokens => {
    const next = await refresh(tokens); await connected(teacher);
    replacement = (await c.rowFor(teacher.id)).credentials; return next;
  });
  try { await expect(c.credentials(teacher.id)).rejects.toMatchObject({ code: 'integration_not_connected' }); }
  finally { newer.mockRestore(); }
  expect((await c.rowFor(teacher.id)).credentials).toBe(replacement);
});

test('P3: access_denied consume state y redirige con código sin cambiar el grant existente', async () => {
  const { teacher } = await chain(); await connected(teacher); const previous = (await c.rowFor(teacher.id)).credentials;
  const url = new URL((await c.connect(teacher)).url);
  url.searchParams.set('error', 'access_denied'); url.searchParams.set('error_description', 'secreto-del-proveedor');
  const result = await request(app).get(url.pathname + url.search);
  expect(result.status).toBe(302); expect(result.headers.location).toBe('http://localhost:4200/teacher/integrations/zoom?zoom=zoom_oauth_denied');
  expect(result.headers['cache-control']).toBe('no-store');
  expect((await c.rowFor(teacher.id)).credentials).toBe(previous);
  expect((await c.rowFor(teacher.id)).oauthVerifier).toBeNull();
  expect((await request(app).get(url.pathname + url.search)).status).toBe(400);
});
test('P3: FRONTEND_URL y redirect exigen HTTPS sin credenciales, localhost HTTP solo fuera de producción', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, FRONTEND_URL: process.env.FRONTEND_URL, ZOOM_REDIRECT_URI: process.env.ZOOM_REDIRECT_URI };
  try {
    for (const field of ['FRONTEND_URL', 'ZOOM_REDIRECT_URI']) {
      for (const value of ['http://example.test/api/integrations/zoom/callback', 'https://user:pass@example.test/api/integrations/zoom/callback', 'javascript:alert(1)', 'inválida']) {
        process.env[field] = value;
        expect(() => c.config()).toThrow(expect.objectContaining({ code: 'zoom_configuration' }));
      }
      delete process.env[field];
    }
    process.env.FRONTEND_URL = 'https://platform.spanishnow.ar/path';
    process.env.ZOOM_REDIRECT_URI = 'https://platform.spanishnow.ar/api/integrations/zoom/callback';
    expect(c.config().frontend).toBe('https://platform.spanishnow.ar');
    process.env.NODE_ENV = 'production'; process.env.FRONTEND_URL = 'http://localhost:4200';
    expect(() => c.config()).toThrow(expect.objectContaining({ code: 'zoom_configuration' }));
  } finally { for (const [key,value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
