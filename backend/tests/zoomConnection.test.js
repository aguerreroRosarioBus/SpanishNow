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
test('OAuth fake por docente, cifrado, state de un uso, cookie obligatoria, perfil sin credenciales', async () => {
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
  expect((await request(app).get('/api/integrations/zoom/start').query({ state })).status).toBe(400);
  process.env.FEATURE_ZOOM = '0';
  expect((await as(teacher).post('/api/integrations/zoom/connect')).body.code).toBe('feature_disabled');
  process.env.FEATURE_ZOOM = '1'; process.env.INTEGRATIONS_FAKE = '0';
  await expect(c.connect(teacher)).rejects.toMatchObject({ code: 'zoom_fake_required' });
  process.env.INTEGRATIONS_FAKE = '1';
});

test('PKCE fake rechaza canje con verificador ajeno y la impersonación no inicia OAuth', async () => {
  const { teacher } = await chain(); const start = await c.connect(teacher); const agent = request.agent(app);
  const navigation = await agent.get(new URL(start.url).pathname + new URL(start.url).search);
  const url = new URL(navigation.headers.location); const row = await c.rowFor(teacher.id); const pending = cipher.decrypt(row.oauthVerifier);
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
