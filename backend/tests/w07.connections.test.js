// W07 · servicio genérico de conexiones externas: cifrado, OAuth de un solo uso y refresh serializado (CAL-08).
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.INTEGRATIONS_FAKE = '1';
const M = require('../src/models');
const connections = require('../src/services/externalConnections');
const { adapter, fake } = require('../src/services/googleCalendar');
const { createUser } = require('./helpers/fixtures');

beforeEach(() => fake.reset());

async function connected(label = 'cal-conexion') {
  const user = await createUser('teacher', label);
  const { state } = await connections.beginOAuth(user.id, 'google_calendar');
  const pending = await connections.consumeOAuth('google_calendar', state);
  const tokens = await adapter().exchangeCode({ code: 'fake-code', verifier: pending.verifier });
  const row = await connections.saveCredentials(pending.connectionId, tokens);
  return { user, row, tokens };
}

test('las credenciales se guardan cifradas y la vista pública no las expone', async () => {
  const { row, tokens } = await connected();
  const stored = await M.ExternalConnection.findByPk(row.id);
  expect(stored.credentials).not.toContain(tokens.accessToken);
  expect(stored.credentials).not.toContain(tokens.refreshToken);
  const json = JSON.stringify(connections.view(stored));
  expect(json).not.toMatch(/credentials|refresh|oauth|Verifier/i);
  expect(connections.view(stored)).toMatchObject({ status: 'connected', connected: true, accountEmail: 'calendar-fake@example.test' });
});

test('el state de OAuth es de un solo uso, solo se guarda su hash y vence', async () => {
  const user = await createUser('teacher', 'cal-state');
  const { state, challenge } = await connections.beginOAuth(user.id, 'google_calendar');
  expect(challenge).toMatch(/^[\w-]{43}$/);
  const row = await M.ExternalConnection.findOne({ where: { userId: user.id } });
  expect(row.oauthStateHash).toBe(connections.sha256(state));
  expect(row.oauthVerifier).not.toContain(state);
  const results = await Promise.allSettled([connections.consumeOAuth('google_calendar', state), connections.consumeOAuth('google_calendar', state)]);
  expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(results.find(r => r.status === 'rejected').reason.code).toBe('oauth_state_invalid');
  const second = await connections.beginOAuth(user.id, 'google_calendar');
  await M.ExternalConnection.update({ oauthExpiresAt: new Date(Date.now() - 1000) }, { where: { userId: user.id } });
  await expect(connections.consumeOAuth('google_calendar', second.state)).rejects.toMatchObject({ code: 'oauth_state_invalid' });
  await expect(connections.consumeOAuth('google_calendar', 'corto')).rejects.toMatchObject({ code: 'oauth_state_invalid' });
});

test('refresh serializado: diez pedidos simultáneos con el token vencido refrescan una sola vez', async () => {
  const { row } = await connected('cal-refresh');
  await row.update({ tokenExpiresAt: new Date(0) });
  const stored = await M.ExternalConnection.findByPk(row.id);
  // Fuerza que el token guardado esté vencido reescribiendo las credenciales con expiresAt pasado.
  const { encrypt, decrypt } = require('../src/services/liveGoogleService');
  await stored.update({ credentials: encrypt({ ...decrypt(stored.credentials), expiresAt: Date.now() - 1000 }) });
  fake.setDelay(60);
  const tokens = await Promise.all(Array.from({ length: 10 }, () => connections.accessToken(row.id, adapter().refresh)));
  expect(new Set(tokens).size).toBe(1);
  expect(fake.calls().refresh).toBe(1);
  expect((await M.ExternalConnection.findByPk(row.id)).refreshLockedUntil).toBeNull();
});

test('un refresh que muere deja el lease vencible y revocación marca la conexión sin tocar google_connections', async () => {
  const { row, user } = await connected('cal-revoca');
  await M.GoogleConnection.create({ userId: user.id, credentials: 'x', email: 'drive@example.test' });
  const { encrypt, decrypt } = require('../src/services/liveGoogleService');
  const expire = async () => { const r = await M.ExternalConnection.findByPk(row.id); await r.update({ credentials: encrypt({ ...decrypt(r.credentials), expiresAt: 0 }) }); };
  await expire();
  fake.revokeAuthorization();
  await expect(connections.accessToken(row.id, adapter().refresh)).rejects.toMatchObject({ code: 'authorization_revoked', needsAttention: true });
  const after = await M.ExternalConnection.findByPk(row.id);
  expect(after).toMatchObject({ status: 'revoked', refreshLockedUntil: null });
  expect(await M.GoogleConnection.count({ where: { userId: user.id } })).toBe(1);
  await expect(connections.accessToken(row.id, adapter().refresh)).rejects.toMatchObject({ code: 'integration_not_connected' });
});

test('desconectar borra credenciales, conserva la fila y no resucita con un refresh en vuelo', async () => {
  const { row } = await connected('cal-desconecta');
  await connections.disconnect(await M.ExternalConnection.findByPk(row.id));
  const after = await M.ExternalConnection.findByPk(row.id);
  expect(after).toMatchObject({ status: 'disconnected', credentials: null });
  await expect(connections.accessToken(row.id, adapter().refresh)).rejects.toMatchObject({ code: 'integration_not_connected' });
});
