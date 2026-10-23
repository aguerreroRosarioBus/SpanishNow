const http = require('node:http');
const { once } = require('node:events');
const { createZoomRealAdapter, SCOPES } = require('../src/services/zoomRealAdapter');

const ORIGINAL_ENV = Object.fromEntries(['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_REDIRECT_URI', 'ZOOM_WEBHOOK_SECRET_TOKEN']
  .map(name => [name, process.env[name]]));
let server;
let baseUrl;
let requests;
let mode;

function send(res, status, body = null, headers = {}) {
  res.writeHead(status, { ...(body === null ? {} : { 'Content-Type': 'application/json' }), ...headers });
  res.end(body === null ? '' : JSON.stringify(body));
}

beforeAll(async () => {
  process.env.ZOOM_CLIENT_ID = 'local-client';
  process.env.ZOOM_CLIENT_SECRET = 'local-secret';
  process.env.ZOOM_REDIRECT_URI = 'https://platform.spanishnow.ar/api/integrations/zoom/callback';
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = 'local-webhook-secret';
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const url = new URL(req.url, 'http://localhost');
    const body = req.headers['content-type']?.includes('application/json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
    requests.push({ method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, raw, body });

    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      if (mode === 'invalid_grant' && body.grant_type === 'refresh_token') return send(res, 400, { error: 'invalid_grant' });
      if (mode === 'invalid_request' && body.grant_type === 'refresh_token') return send(res, 400, { error: 'invalid_request', reason: 'Invalid Token!' });
      if (mode === 'refresh_unauthorized' && body.grant_type === 'refresh_token') return send(res, 401, { error: 'invalid_request' });
      if (body.grant_type === 'authorization_code') return send(res, 200, {
        access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600,
        scope: mode === 'missing_scopes' ? 'meeting:read:meeting' : SCOPES.join(' ')
      });
      return send(res, 200, { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 });
    }
    if (url.pathname === '/oauth/revoke' && req.method === 'POST') return send(res, 200, {});
    if (url.pathname === '/v2/users/me' && mode === 'profile_failure') return send(res, 503, { code: 300 });
    if (url.pathname === '/v2/users/me') return send(res, 200, {
      id: 'zoom-user-7', account_id: 'zoom-account-9', email: 'teacher@example.test', type: 1,
      feature: { meeting_capacity: 100 }
    });
    if (url.pathname === '/v2/users/me/settings') return send(res, 200, { meeting_security: { waiting_room: mode === 'waiting_room_default_on' } });
    if (url.pathname === '/v2/users/me/meetings' && req.method === 'GET') {
      if (mode === 'rate_limited') return send(res, 429, { code: 429 }, { 'Retry-After': '12' });
      if (mode === 'unauthorized') return send(res, 401, { code: 124 });
      if (mode === 'upstream_error') return send(res, 503, { code: 300 });
      if (url.searchParams.get('next_page_token') === 'page-2') return send(res, 200, { meetings: [
        { id: 345, join_url: 'https://zoom.us/j/345678901?pwd=abc', agenda: 'SpanishNow correlation=class:42' }
      ] });
      return send(res, 200, { meetings: [{ id: 123, join_url: 'https://zoom.us/j/123456789', agenda: 'otra' }], next_page_token: 'page-2' });
    }
    if (url.pathname === '/v2/users/me/meetings' && req.method === 'POST') return send(res, 201, {
      id: 789123456, join_url: 'https://zoom.us/j/789123456?pwd=join-code', agenda: body.agenda,
      ...(mode === 'create_without_settings' ? {} : { settings: { waiting_room: mode !== 'waiting_room_forced_off' } })
    });
    if (url.pathname === '/v2/meetings/789123456' && req.method === 'PATCH') return send(res, 204);
    if (url.pathname === '/v2/meetings/789123456' && req.method === 'GET') return send(res, 200, {
      id: 789123456, join_url: 'https://zoom.us/j/789123456?pwd=join-code', agenda: 'SpanishNow correlation=class:42',
      start_url: 'https://us06web.zoom.us/s/host-me?zak=ephemeral',
      settings: { waiting_room: mode !== 'waiting_room_forced_off' }
    });
    if (url.pathname === '/v2/meetings/789123456' && req.method === 'DELETE') return send(res, 204);
    return send(res, 404, { code: 404 });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => { requests = []; mode = null; });

afterAll(async () => {
  if (server?.listening) { server.close(); await once(server, 'close'); }
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('OAuth PKCE, Basic, scopes granulares, capacidades de cuenta y rotación de refresh', async () => {
  const adapter = createZoomRealAdapter({ oauthBaseUrl: baseUrl, apiBaseUrl: `${baseUrl}/v2` });
  const challenge = 'pkce-s256-challenge';
  const authorization = new URL(adapter.authorizeUrl({ state: 'state-1', challenge }));
  expect(authorization.pathname).toBe('/oauth/authorize');
  expect(authorization.searchParams.get('response_type')).toBe('code');
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('code_challenge')).toBe(challenge);
  expect(authorization.searchParams.get('scope').split(' ')).toEqual(SCOPES);

  const tokens = await adapter.authorize({ code: 'code-1', verifier: 'pkce-verifier' });
  expect(tokens).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1', accountId: 'zoom-account-9',
    userId: 'zoom-user-7', email: 'teacher@example.test', capabilities: {
      plan: 'basic', maxMinutes: 40, maxParticipants: 100, concurrentMeetings: 1, waitingRoom: false, passcodeRequired: true
    } });
  expect(requests[0].headers.authorization).toBe(`Basic ${Buffer.from('local-client:local-secret').toString('base64')}`);
  expect(requests[0].body).toMatchObject({ grant_type: 'authorization_code', code: 'code-1', code_verifier: 'pkce-verifier',
    redirect_uri: process.env.ZOOM_REDIRECT_URI });
  expect(requests.some(r => r.path === '/v2/users/me/settings' && r.query.get('option') === 'meeting_security')).toBe(true);

  const rotated = await adapter.refresh(tokens);
  expect(rotated).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2', scopes: SCOPES.join(' ') });
  const refreshRequest = requests.find(r => r.path === '/oauth/token' && r.body.grant_type === 'refresh_token');
  expect(refreshRequest.headers.authorization).toBe(`Basic ${Buffer.from('local-client:local-secret').toString('base64')}`);
  expect(refreshRequest.body.refresh_token).toBe('refresh-1');

  await adapter.revoke(rotated.accessToken);
  const revokeRequest = requests.find(r => r.path === '/oauth/revoke');
  expect(revokeRequest.headers.authorization).toBe(`Basic ${Buffer.from('local-client:local-secret').toString('base64')}`);
  expect(revokeRequest.body.token).toBe('access-2');
});

test('Meetings API reconcilia por correlationKey y soporta crear, actualizar, borrar y obtener start_url', async () => {
  const adapter = createZoomRealAdapter({ oauthBaseUrl: baseUrl, apiBaseUrl: `${baseUrl}/v2` });
  const tokens = { accessToken: 'access-2' };
  const match = await adapter.find(tokens, 'class:42');
  expect(match).toMatchObject({ id: '345', correlationKey: 'class:42', joinUrl: 'https://zoom.us/j/345678901?pwd=abc' });
  expect(requests.filter(r => r.path === '/v2/users/me/meetings').map(r => r.query.get('next_page_token'))).toEqual([null, 'page-2']);

  const wanted = { correlationKey: 'class:42', startsAt: '2026-10-24T18:30:00.000Z', minutes: 40 };
  const created = await adapter.create(tokens, wanted);
  expect(created).toMatchObject({ id: '789123456', correlationKey: 'class:42', joinUrl: expect.stringContaining('zoom.us/j/') });
  const createRequest = requests.find(r => r.method === 'POST' && r.path === '/v2/users/me/meetings');
  expect(createRequest.headers.authorization).toBe('Bearer access-2');
  expect(createRequest.body).toMatchObject({ type: 2, start_time: wanted.startsAt, duration: 40, timezone: 'UTC',
    agenda: 'SpanishNow correlation=class:42', settings: { waiting_room: true, join_before_host: false, auto_recording: 'none' } });
  expect(createRequest.body.password).toMatch(/^[a-f0-9]{10}$/);

  const updated = await adapter.update(tokens, created.id, { ...wanted, minutes: 35 });
  expect(updated).toMatchObject({ id: '789123456', correlationKey: 'class:42' });
  const updateRequest = requests.find(r => r.method === 'PATCH' && r.path === '/v2/meetings/789123456');
  expect(updateRequest).toBeTruthy();
  expect(updateRequest.body).not.toHaveProperty('password');
  expect(await adapter.host(tokens, created.id)).toBe('https://us06web.zoom.us/s/host-me?zak=ephemeral');
  await adapter.remove(tokens, created.id);
  expect(requests.some(r => r.method === 'DELETE' && r.path === '/v2/meetings/789123456')).toBe(true);
});

test('errores del proveedor exponen códigos estables y reintento sin contenido sensible', async () => {
  const adapter = createZoomRealAdapter({ oauthBaseUrl: baseUrl, apiBaseUrl: `${baseUrl}/v2` });
  mode = 'unauthorized';
  await expect(adapter.find({ accessToken: 'expired-secret' }, 'class:42')).rejects.toMatchObject({ code: 'zoom_unauthorized', statusCode: 401 });
  mode = 'rate_limited';
  await expect(adapter.find({ accessToken: 'token' }, 'class:42')).rejects.toMatchObject({
    code: 'zoom_rate_limited', statusCode: 429, retryable: true, params: { retryAfterSeconds: 12 }
  });
  mode = 'upstream_error';
  await expect(adapter.find({ accessToken: 'token' }, 'class:42')).rejects.toMatchObject({
    code: 'zoom_provider_unavailable', statusCode: 503, retryable: true
  });
  mode = 'invalid_grant';
  await expect(adapter.refresh({ refreshToken: 'old-refresh' })).rejects.toMatchObject({ code: 'zoom_revoked', statusCode: 401 });
  mode = 'invalid_request';
  await expect(adapter.refresh({ refreshToken: 'used-refresh' })).rejects.toMatchObject({ code: 'zoom_revoked', statusCode: 401 });
  mode = 'refresh_unauthorized';
  await expect(adapter.refresh({ refreshToken: 'expired-refresh' })).rejects.toMatchObject({ code: 'zoom_revoked', statusCode: 401 });
});

test.each([
  ['profile_failure', 'zoom_provider_unavailable'],
  ['missing_scopes', 'zoom_oauth_scopes_missing']
])('OAuth revoca el token recién emitido si falla el perfil o faltan scopes (%s)', async (failure, code) => {
  const adapter = createZoomRealAdapter({ oauthBaseUrl: baseUrl, apiBaseUrl: `${baseUrl}/v2` });
  mode = failure;
  await expect(adapter.authorize({ code: 'code-1', verifier: 'pkce-verifier' })).rejects.toMatchObject({ code });
  const revoke = requests.find(r => r.path === '/oauth/revoke');
  expect(revoke).toMatchObject({ method: 'POST', body: { token: 'access-1' } });
});

test('cuenta con sala de espera desactivada por defecto: la reunión se crea con sala de espera activa', async () => {
  const adapter = createZoomRealAdapter({ oauthBaseUrl: baseUrl, apiBaseUrl: `${baseUrl}/v2` });
  const wanted = { correlationKey: 'class:42', startsAt: '2026-10-24T18:30:00.000Z', minutes: 40 };
  const created = await adapter.create({ accessToken: 'access-2' }, wanted);
  expect(created.waitingRoom).toBe(true);
  expect(requests.find(r => r.method === 'POST' && r.path === '/v2/users/me/meetings').body.settings.waiting_room).toBe(true);
});
test('si la creación no devuelve settings se consulta la reunión; si Zoom la apaga, waitingRoom es falso', async () => {
  const adapter = createZoomRealAdapter({ oauthBaseUrl: baseUrl, apiBaseUrl: `${baseUrl}/v2` });
  const wanted = { correlationKey: 'class:42', startsAt: '2026-10-24T18:30:00.000Z', minutes: 40 };
  mode = 'create_without_settings';
  expect((await adapter.create({ accessToken: 'access-2' }, wanted)).waitingRoom).toBe(true);
  expect(requests.some(r => r.method === 'GET' && r.path === '/v2/meetings/789123456')).toBe(true);
  mode = 'waiting_room_forced_off';
  expect((await adapter.create({ accessToken: 'access-2' }, wanted)).waitingRoom).toBe(false);
  expect((await adapter.update({ accessToken: 'access-2' }, '789123456', wanted)).waitingRoom).toBe(false);
});
