const crypto = require('crypto');
jest.mock('../src/config/database', () => ({ transaction: jest.fn(fn => fn({ LOCK: { UPDATE: 'UPDATE' } })), close: jest.fn(async () => {}) }));
jest.mock('../src/models', () => ({ GoogleConnection: { upsert: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), update: jest.fn(), destroy: jest.fn() } }));
const { GoogleConnection: Connection } = require('../src/models');
const google = require('../src/services/liveGoogleService');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
let row; let env;
beforeEach(() => {
  env = { ...process.env }; jest.clearAllMocks();
  process.env.NODE_ENV = 'test'; process.env.FRONTEND_URL = 'http://localhost:4200';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client'; process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3001/api/live-classes/google/callback';
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  row = { userId: 7, update: jest.fn(async values => Object.assign(row, values)) };
  Connection.upsert.mockImplementation(async values => { Object.assign(row, values); });
  Connection.findOne.mockResolvedValue(row); Connection.findByPk.mockResolvedValue(row);
  global.fetch = jest.fn();
});
afterEach(() => { process.env = env; jest.restoreAllMocks(); });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('tokens are encrypted with randomized authenticated encryption and tampering fails closed', () => {
  const secret = { refreshToken: 'private-refresh-token' };
  const encrypted = google.encrypt(secret);
  expect(encrypted).not.toContain(secret.refreshToken); expect(google.decrypt(encrypted)).toEqual(secret);
  expect(google.encrypt(secret)).not.toBe(encrypted);
  const damaged = Buffer.from(encrypted, 'base64'); damaged[32] ^= 1;
  expect(() => google.decrypt(damaged.toString('base64'))).toThrow(/conectar/);
  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  expect(google.configured()).toBe(false);
});
test('production requires HTTPS and never falls back to JWT_SECRET for encryption', () => {
  process.env.NODE_ENV = 'production';
  expect(google.configured()).toBe(false);
  process.env.FRONTEND_URL = 'https://app.example.com'; process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://api.example.com/api/live-classes/google/callback';
  expect(google.configured()).toBe(true);
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'bad'; process.env.JWT_SECRET = 'some-secret';
  expect(google.configured()).toBe(false);
});
test('OAuth uses a first-party start navigation, HttpOnly state cookie, PKCE and limited scopes', async () => {
  const result = await google.connect(7);
  const url = new URL(result.url), state = url.searchParams.get('state');
  expect(url.pathname).toBe('/api/live-classes/google/start'); expect(row.oauthStateHash).toBe(hash(state));
  expect(result).not.toHaveProperty('accessToken'); expect(row.oauthVerifier).not.toContain('code_verifier');
  const res = { cookie: jest.fn() };
  const auth = new URL(await google.start(state, res));
  expect(res.cookie).toHaveBeenCalledWith(google.cookieName, state, expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
  expect(auth.hostname).toBe('accounts.google.com'); expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
  const verifier = google.decrypt(row.oauthVerifier);
  expect(auth.searchParams.get('code_challenge')).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'));
  expect(auth.searchParams.get('scope').split(' ')).toEqual(google.SCOPES);
  expect(google.SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
  expect(google.SCOPES).not.toContain('https://www.googleapis.com/auth/drive');
});
async function pending() {
  const result = await google.connect(7); const state = new URL(result.url).searchParams.get('state');
  return { query: { state, code: 'test-code' }, headers: { cookie: `${google.cookieName}=${state}` } };
}
test('callback rejects mismatched cookies, missing state, expiry and replay before exchanging a code', async () => {
  const req = await pending();
  await expect(google.callback({ ...req, headers: { cookie: `${google.cookieName}=wrong` } })).rejects.toThrow(/navegador/);
  await expect(google.callback({ query: {}, headers: {} })).rejects.toThrow();
  row.oauthExpiresAt = new Date(Date.now() - 1000);
  await expect(google.callback(req)).rejects.toThrow(/venció/);
  row.oauthExpiresAt = new Date(Date.now() + 10000); row.oauthVerifier = null;
  await expect(google.callback(req)).rejects.toThrow(/venció/);
  expect(fetch).not.toHaveBeenCalled();
});
test('callback consumes state once and stores encrypted credentials; secrets never enter the return URL', async () => {
  const req = await pending();
  fetch.mockResolvedValueOnce(response({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600, scope: google.SCOPES.join(' ') }))
    .mockResolvedValueOnce(response({ email: 'teacher@example.test' }));
  await google.callback(req);
  expect(row.update).toHaveBeenCalledWith({ oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null }, expect.any(Object));
  const saved = Connection.update.mock.calls[0][0];
  expect(saved.email).toBe('teacher@example.test'); expect(saved.credentials).not.toContain('private');
  expect(google.decrypt(saved.credentials)).toMatchObject({ accessToken: 'private-access', refreshToken: 'private-refresh' });
  expect(fetch.mock.calls[0][1].body.get('code_verifier')).toBeTruthy();
  await expect(google.callback(req)).rejects.toThrow(/venció/);
});
test('partial consent never replaces a valid existing connection', async () => {
  const req = await pending();
  fetch.mockResolvedValue(response({ access_token: 'access', refresh_token: 'refresh', scope: 'https://www.googleapis.com/auth/drive.file' }));
  await expect(google.callback(req)).rejects.toThrow(/Debes autorizar/);
  expect(Connection.update).not.toHaveBeenCalled();
});
test('expired access tokens are refreshed without replacing the stored refresh token', async () => {
  row.credentials = google.encrypt({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 0 });
  fetch.mockResolvedValue(response({ access_token: 'new', expires_in: 3600 }));
  expect(await google.accessToken(7)).toBe('new');
  expect(google.decrypt(row.credentials)).toMatchObject({ accessToken: 'new', refreshToken: 'refresh' });
  expect(fetch.mock.calls[0][1].body.get('grant_type')).toBe('refresh_token');
});
test('rejected refresh asks the teacher to reconnect; status does not expose ciphertext or tokens', async () => {
  row.credentials = google.encrypt({ refreshToken: 'refresh', expiresAt: 0 }); row.email = 'teacher@example.test';
  fetch.mockResolvedValue(response({ error: 'invalid_grant' }, 400));
  await expect(google.accessToken(7)).rejects.toMatchObject({ status: 401 });
  expect(await google.status(7)).toEqual({ configured: true, connected: true, email: 'teacher@example.test' });
});
test('Drive saves editable JSON and updates the same file; listing uses only application files', async () => {
  row.credentials = google.encrypt({ accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 1000000 });
  fetch.mockImplementation(async () => response({ id: 'drive-file-1', files: [] }));
  await google.saveDrive(7, { title: 'Mi clase', board: { pages: [] } });
  const first = fetch.mock.calls[0];
  expect(first[1].method).toBe('POST'); expect(first[1].body).toContain('spanishnow-live-board');
  expect(first[1].headers.Authorization).toBe('Bearer access');
  await google.saveDrive(7, { title: 'Mi clase', board: { pages: [] }, driveFileId: 'drive-file-1' });
  expect(String(fetch.mock.calls[1][0])).toContain('/files/drive-file-1?'); expect(fetch.mock.calls[1][1].method).toBe('PATCH');
  await google.driveFiles(7);
  expect(new URL(fetch.mock.calls[2][0]).searchParams.get('q')).toContain('spanishnowLiveBoard');
});
test('Classroom lists classes taught by this account; linking verifies teacher membership and announcement is explicit', async () => {
  row.credentials = google.encrypt({ accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 1000000 });
  fetch.mockImplementation(async () => response({ courses: [{ id: '123', name: 'Español' }], id: '123', name: 'Español' }));
  expect((await google.courses(7)).courses[0].name).toBe('Español');
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('teacherId')).toBe('me');
  await google.course(7, '123');
  expect(fetch.mock.calls[1][0]).toContain('/courses/123/teachers/me');
  await google.announce(7, { title: 'Mi clase', joinCode: 'abcdefghijklmnop', classroomCourseId: '123' });
  const announcement = JSON.parse(fetch.mock.calls[3][1].body);
  expect(announcement.materials[0].link.url).toBe('http://localhost:4200/live/join/abcdefghijklmnop');
  expect(announcement.state).toBe('PUBLISHED');
});
