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
  try {
    redirect = new URL(process.env.ZOOM_REDIRECT_URI || 'http://localhost:3000/api/integrations/zoom/callback');
    frontend = new URL(process.env.FRONTEND_URL || 'http://localhost:4200');
  } catch { fail('zoom_configuration', 503); }
  for (const url of [redirect, frontend]) {
    const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || url.username || url.password) fail('zoom_configuration', 503);
  }
  if (redirect.pathname !== '/api/integrations/zoom/callback') fail('zoom_configuration', 503);
  return { redirect, frontend: frontend.origin };
}
async function connect(user) {
  await teacher(user); adapter.assertFake(); config();
  const state = crypto.randomBytes(32).toString('base64url');
  const pending = { accountId: hash(`${process.env.DB_NAME}:${user.id}:${user.email}`), verifier: crypto.randomBytes(48).toString('base64url'), code: crypto.randomBytes(32).toString('base64url') };
  const encrypted = cipher.encrypt(pending);
  await db.transaction(async transaction => {
    await M.User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
    const [row] = await M.ExternalConnection.findOrCreate({ where: { userId: user.id, provider: 'zoom' }, transaction });
    await row.update({ oauthStateHash: hash(state), oauthVerifier: encrypted, oauthExpiresAt: new Date(Date.now() + 600000), version: row.version + 1 }, { transaction });
  });
  await adapter.issueAuthorization({ code: pending.code, challenge: crypto.createHash('sha256').update(pending.verifier).digest('base64url'), accountId: pending.accountId });
  const url = config().redirect; url.search = new URLSearchParams({ state, code: pending.code }).toString();
  return { url: url.href, fake: true };
}
// El callback nunca activa el grant: solo quien inició puede confirmarlo con su sesión autenticada.
async function callback(req) {
  adapter.assertFake(); config();
  const pending = await connections.consumeOAuth('zoom', req.query.state);
  const user = await M.User.findByPk(pending.userId); await teacher(user);
  if (req.query.error) fail('zoom_oauth_denied', 400);
  const c = pending.verifier;
  const tokens = await adapter.authorize({ code: req.query.code, expectedCode: c.code, verifier: c.verifier, accountId: c.accountId });
  return connections.stagePending(pending.connectionId, tokens);
}
async function complete(user, token) {
  await teacher(user); adapter.assertFake();
  const result = await connections.completePending('zoom', token, user.id);
  // El fake no tiene grants remotos que revocar. Al consumir el pendiente se descartan sus tokens.
  if (!result.ok) fail('forbidden', 403);
  const credentials = result.tokens;
  await db.transaction(async transaction => {
    const row = await M.ExternalConnection.findByPk(result.connectionId, { transaction, lock: transaction.LOCK.UPDATE });
    await row.update({ status: 'connected', credentials: cipher.encrypt(credentials), accountEmail: credentials.email,
      scopes: scope, tokenExpiresAt: new Date(credentials.expiresAt), lastError: null, refreshLockedUntil: null,
      version: row.version + 1 }, { transaction });
  });
  return status(user);
}
// Un grant ilegible requiere reconexión; no filtrar errores del cifrador ni invalidar una reconexión concurrente.
async function readTokens(row) {
  try { return cipher.decrypt(row.credentials); }
  catch {
    await M.ExternalConnection.update({ status: 'needs_attention', lastError: 'zoom_authorization_lost', refreshLockedUntil: null,
      version: db.literal('version + 1') }, { where: { id: row.id, status: 'connected', credentials: row.credentials } });
    fail('zoom_authorization_lost');
  }
}
async function credentials(userId) {
  adapter.assertFake();
  let row = await rowFor(userId);
  if (!row?.credentials || row.status !== 'connected') fail('integration_not_connected');
  const tokens = await readTokens(row);
  if (row.tokenExpiresAt > new Date(Date.now() + 60000)) return { row, tokens };
  // CAS con lease: solo una réplica puede rotar el refresh token; ninguna llamada bajo lock SQL.
  const lease = new Date(Math.floor(Date.now() / 1000) * 1000 + 30000);
  const [claimed] = await M.ExternalConnection.update({ refreshLockedUntil: lease }, { where: { id: row.id, version: row.version, status: 'connected',
    [Op.or]: [{ refreshLockedUntil: null }, { refreshLockedUntil: { [Op.lt]: new Date() } }] } });
  if (!claimed) fail('zoom_busy', 503);
  try {
    const next = await adapter.refresh(tokens);
    const [saved] = await M.ExternalConnection.update({ credentials: cipher.encrypt(next), tokenExpiresAt: new Date(next.expiresAt),
      refreshLockedUntil: null, version: db.literal('version + 1'), lastError: null },
    // La versión puede cambiar por begin/connect. Solo el lease y el grant original identifican a quien rotó.
    { where: { id: row.id, credentials: row.credentials, status: 'connected', refreshLockedUntil: lease } });
    if (!saved) fail('integration_not_connected');
    row = await rowFor(userId); return { row, tokens: next };
  } catch (error) {
    await M.ExternalConnection.update({ refreshLockedUntil: null, ...(error.code === 'zoom_revoked' ? { status: 'revoked', credentials: null, lastError: 'zoom_revoked' } : {}) },
      { where: { id: row.id, credentials: row.credentials, status: 'connected', refreshLockedUntil: lease } });
    throw error;
  }
}
async function status(user) {
  await teacher(user); const row = await rowFor(user.id);
  let capabilities = null;
  if (row?.status === 'connected' && process.env.INTEGRATIONS_FAKE === '1') {
    try { const c = await credentials(user.id); capabilities = await adapter.capabilities(c.tokens); }
    catch (error) { if (!['zoom_revoked', 'zoom_authorization_lost', 'integration_not_connected', 'zoom_busy'].includes(error.code)) throw error; }
  }
  const current = await rowFor(user.id);
  return { fake: process.env.INTEGRATIONS_FAKE === '1', status: current?.status || 'disconnected', accountEmail: current?.accountEmail || null,
    lastError: current?.lastError || null, capabilities };
}
async function disconnect(user) {
  await teacher(user);
  await db.transaction(async transaction => {
    const row = await M.ExternalConnection.findOne({ where: { userId: user.id, provider: 'zoom' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) return;
    await row.update({ status: 'disconnected', credentials: null, oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null,
      tokenExpiresAt: null, refreshLockedUntil: null, version: row.version + 1 }, { transaction });
    const sessions = await M.ClassSession.findAll({ where: { teacherId: user.id }, attributes: ['id'], transaction });
    await M.ExternalSyncRef.update({ status: 'needs_attention', lastError: 'integration_not_connected' },
      { where: { provider: 'zoom', sessionId: sessions.map(s => s.id), status: { [Op.ne]: 'cancelled' } }, transaction });
  });
  return status(user);
}
module.exports = { teacher, connect, callback, complete, credentials, status, disconnect, rowFor, readTokens, config };
