// Fachada exclusiva de Zoom fake. No implementa ni modifica el servicio genérico de W07.
// Reutiliza el cifrado existente; todas las consultas se limitan a provider=zoom.
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../config/database');
const M = require('../models');
const cipher = require('./liveGoogleService');
const adapter = require('./zoomAdapter');
const { fail, hash } = adapter;
const connections = require('./externalConnections');
const scope = 'fake:meetings fake:account';
const rowFor = userId => M.ExternalConnection.findOne({ where: { userId, provider: 'zoom' } });
async function teacher(user) {
  const settings = user?.role === 'teacher' && await M.TeacherClassSettings.findByPk(user.id);
  if (!settings?.classesEnabledAt || user.suspendedAt) fail('forbidden', 403);
}
// Mismas reglas que googleCalendarService.config(): HTTPS o localhost HTTP fuera de producción.
function config() {
  let redirect, frontend;
  adapter.assertConfigured();
  try {
    redirect = new URL(process.env.ZOOM_REDIRECT_URI || (adapter.isFake() ? 'http://localhost:3000/api/integrations/zoom/callback' : ''));
    frontend = new URL(process.env.FRONTEND_URL || 'http://localhost:4200');
  } catch { fail('provider_unavailable', 503, { reason: 'not_configured' }); }
  const local = url => process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!redirect.href.startsWith('https:') && !(adapter.isFake() && local(redirect))) || redirect.username || redirect.password
    || (!frontend.href.startsWith('https:') && !local(frontend)) || frontend.username || frontend.password) {
    fail('provider_unavailable', 503, { reason: 'not_configured' });
  }
  if (redirect.pathname !== '/api/integrations/zoom/callback') fail('provider_unavailable', 503, { reason: 'not_configured' });
  return { redirect, frontend: frontend.origin };
}
async function connect(user) {
  await teacher(user); const { redirect } = config();
  const state = crypto.randomBytes(32).toString('base64url');
  const pending = { verifier: crypto.randomBytes(48).toString('base64url') };
  if (adapter.isFake()) {
    pending.accountId = hash(`${process.env.DB_NAME}:${user.id}:${user.email}`);
    pending.code = crypto.randomBytes(32).toString('base64url');
  }
  const encrypted = cipher.encrypt(pending);
  await db.transaction(async transaction => {
    await M.User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
    const [row] = await M.ExternalConnection.findOrCreate({ where: { userId: user.id, provider: 'zoom' }, transaction });
    await row.update({ oauthStateHash: hash(state), oauthVerifier: encrypted, oauthExpiresAt: new Date(Date.now() + 600000), version: row.version + 1 }, { transaction });
  });
  const challenge = crypto.createHash('sha256').update(pending.verifier).digest('base64url');
  if (adapter.isFake()) {
    await adapter.issueAuthorization({ code: pending.code, challenge, accountId: pending.accountId });
    redirect.search = new URLSearchParams({ state, code: pending.code }).toString();
    return { url: redirect.href, fake: true };
  }
  return { url: adapter.authorizeUrl({ state, challenge }), fake: false };
}
// El callback nunca activa el grant: solo quien inició puede confirmarlo con su sesión autenticada.
async function callback(req) {
  const { redirect } = config();
  const pending = await connections.consumeOAuth('zoom', req.query.state);
  if (req.query.error) fail(req.query.error === 'access_denied' ? 'zoom_oauth_denied' : 'zoom_oauth_invalid', 400);
  if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) fail('zoom_oauth_invalid', 400);
  const user = await M.User.findByPk(pending.userId); await teacher(user);
  const c = pending.verifier;
  const tokens = await adapter.authorize({ code: req.query.code, verifier: c.verifier, expectedCode: c.code, accountId: c.accountId, redirectUri: redirect.href });
  return connections.stagePending(pending.connectionId, tokens);
}
async function complete(user, token) {
  await teacher(user); adapter.assertConfigured();
  const result = await connections.completePending('zoom', token, user.id);
  if (!result.ok) {
    if (!adapter.isFake() && result.tokens?.accessToken) await adapter.revoke(result.tokens.accessToken).catch(() => {});
    fail('forbidden', 403);
  }
  const credentials = result.tokens;
  const { capabilities, email, scopes, ...tokenData } = credentials;
  await db.transaction(async transaction => {
    const row = await M.ExternalConnection.findByPk(result.connectionId, { transaction, lock: transaction.LOCK.UPDATE });
    await row.update({ status: 'connected', credentials: cipher.encrypt(tokenData), capabilities: capabilities || null,
      accountEmail: email || row.accountEmail, scopes: scopes || (adapter.isFake() ? scope : adapter.scopes.join(' ')),
      tokenExpiresAt: new Date(credentials.expiresAt), lastError: null, refreshLockedUntil: null,
      version: row.version + 1 }, { transaction });
  });
  return status(user);
}
// Un grant ilegible requiere reconexión; no filtrar errores del cifrador ni invalidar una reconexión concurrente.
async function readTokens(row) {
  try { return cipher.decrypt(row.credentials); }
  catch {
    await M.ExternalConnection.update({ status: 'needs_attention', credentials: null, capabilities: null, lastError: 'zoom_authorization_lost', refreshLockedUntil: null,
      version: db.literal('version + 1') }, { where: { id: row.id, status: 'connected', credentials: row.credentials } });
    fail('zoom_authorization_lost');
  }
}
const tokenData = tokens => Object.fromEntries(Object.entries(tokens || {}).filter(([key]) => !['email', 'capabilities', 'scopes'].includes(key)));
async function rotate(userId, observedTokens) {
  let row = await rowFor(userId);
  if (!row?.credentials || row.status !== 'connected') fail('integration_not_connected');
  let current = await readTokens(row);
  // Otra réplica ya renovó este grant después de que la API rechazara el token observado.
  if (observedTokens && (current.refreshToken !== observedTokens.refreshToken || current.accessToken !== observedTokens.accessToken)) return current;
  const previous = row.credentials;
  // Lease propio de la conexión Zoom: el intercambio de refresh ocurre fuera del lock de base.
  const lease = new Date(Math.floor(Date.now() / 1000) * 1000 + 30000);
  const [claimed] = await M.ExternalConnection.update({ refreshLockedUntil: lease }, { where: { id: row.id, credentials: previous, version: row.version,
    status: 'connected', [Op.or]: [{ refreshLockedUntil: null }, { refreshLockedUntil: { [Op.lt]: new Date() } }] } });
  if (!claimed) {
    row = await rowFor(userId);
    if (row?.credentials && row.status === 'connected') {
      current = await readTokens(row);
      if (observedTokens && (current.refreshToken !== observedTokens.refreshToken || current.accessToken !== observedTokens.accessToken)) return current;
    }
    fail('zoom_busy', 503, {}, { retryable: true });
  }
  try {
    const next = tokenData(await adapter.refresh(current));
    if (!next.accessToken || !next.refreshToken || !Number.isFinite(new Date(next.expiresAt).getTime())) fail('zoom_provider_unavailable', 503, { reason: 'invalid_token_response' }, { retryable: true });
    const [saved] = await M.ExternalConnection.update({ credentials: cipher.encrypt(next), tokenExpiresAt: new Date(next.expiresAt),
      refreshLockedUntil: null, version: db.literal('version + 1'), lastError: null },
    { where: { id: row.id, credentials: previous, status: 'connected', refreshLockedUntil: lease } });
    if (!saved) fail('integration_not_connected');
    return next;
  } catch (error) {
    await M.ExternalConnection.update({ refreshLockedUntil: null, ...(error.code === 'zoom_revoked'
      ? { status: 'needs_attention', credentials: null, capabilities: null, lastError: 'zoom_revoked', version: db.literal('version + 1') } : {}) },
    { where: { id: row.id, credentials: previous, status: 'connected', refreshLockedUntil: lease } });
    throw error;
  }
}
async function credentials(userId) {
  adapter.assertConfigured();
  const row = await rowFor(userId);
  if (!row?.credentials || row.status !== 'connected') fail('integration_not_connected');
  const tokens = await readTokens(row);
  const refreshed = row.tokenExpiresAt > new Date(Date.now() + 60000) ? tokens : await rotate(userId, tokens);
  return { row: await rowFor(userId), tokens: refreshed };
}
async function withCredentials(userId, tokens, operation) {
  adapter.assertConfigured();
  try { return { value: await operation(tokens), tokens }; }
  catch (error) {
    if (error.statusCode !== 401) throw error;
    const refreshed = await rotate(userId, tokens);
    return { value: await operation(refreshed), tokens: refreshed };
  }
}
async function status(user) {
  await teacher(user); adapter.assertConfigured();
  let current = await rowFor(user.id);
  if (current?.status === 'connected') {
    try { await credentials(user.id); }
    catch (error) {
      if (!['zoom_revoked', 'zoom_authorization_lost', 'integration_not_connected', 'zoom_busy'].includes(error.code)) throw error;
    }
    current = await rowFor(user.id);
  }
  return { fake: adapter.isFake(), status: current?.status || 'disconnected', accountEmail: current?.accountEmail || null,
    lastError: current?.lastError || null, capabilities: current?.status === 'connected' ? current.capabilities || null : null };
}
async function disconnect(user) {
  await teacher(user); adapter.assertConfigured();
  const existing = await rowFor(user.id);
  let credentialsToRevoke = null;
  if (existing?.status === 'connected' && existing.credentials) {
    try { credentialsToRevoke = await readTokens(existing); } catch { /* La revocación local sigue siendo posible si el cifrado quedó ilegible. */ }
  }
  await db.transaction(async transaction => {
    const row = await M.ExternalConnection.findOne({ where: { userId: user.id, provider: 'zoom' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) return;
    await row.update({ status: 'disconnected', credentials: null, oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null,
      tokenExpiresAt: null, refreshLockedUntil: null, capabilities: null, scopes: null, version: row.version + 1 }, { transaction });
    const sessions = await M.ClassSession.findAll({ where: { teacherId: user.id }, attributes: ['id'], transaction });
    await M.ExternalSyncRef.update({ status: 'needs_attention', lastError: 'integration_not_connected' },
      { where: { provider: 'zoom', sessionId: sessions.map(s => s.id), status: { [Op.ne]: 'cancelled' } }, transaction });
  });
  if (credentialsToRevoke?.accessToken && !adapter.isFake()) await adapter.revoke(credentialsToRevoke.accessToken).catch(() => {});
  return status(user);
}
module.exports = { teacher, connect, callback, complete, credentials, withCredentials, rotate, status, disconnect, rowFor, readTokens, config };
