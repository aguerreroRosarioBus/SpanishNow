// Fachada exclusiva de Zoom fake. No implementa ni modifica el servicio genérico de W07.
// Reutiliza el cifrado existente; todas las consultas se limitan a provider=zoom.
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../config/database');
const M = require('../models');
const cipher = require('./liveGoogleService');
const adapter = require('./zoomAdapter');
const { fail, hash } = adapter;
const cookieName = 'spanishnow_zoom_state';
const scope = 'fake:meetings fake:account';
const rowFor = userId => M.ExternalConnection.findOne({ where: { userId, provider: 'zoom' } });
async function teacher(user) {
  const settings = user?.role === 'teacher' && await M.TeacherClassSettings.findByPk(user.id);
  if (!settings?.classesEnabledAt || user.suspendedAt) fail('forbidden', 403);
}
function redirect() {
  let url;
  try { url = new URL(process.env.ZOOM_REDIRECT_URI || 'http://localhost:3000/api/integrations/zoom/callback'); }
  catch { fail('zoom_configuration', 503); }
  if (url.pathname !== '/api/integrations/zoom/callback' || url.username || url.password
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) fail('zoom_configuration', 503);
  return url;
}
async function connect(user) {
  await teacher(user); adapter.assertFake();
  const state = crypto.randomBytes(32).toString('base64url');
  const pending = { verifier: crypto.randomBytes(48).toString('base64url'), code: crypto.randomBytes(32).toString('base64url') };
  const encrypted = cipher.encrypt(pending);
  await db.transaction(async transaction => {
    await M.User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
    const [row] = await M.ExternalConnection.findOrCreate({ where: { userId: user.id, provider: 'zoom' }, transaction });
    await row.update({ oauthStateHash: hash(state), oauthVerifier: encrypted, oauthExpiresAt: new Date(Date.now() + 600000), version: row.version + 1 }, { transaction });
  });
  const url = new URL('start', redirect()); url.searchParams.set('state', state);
  return { url: url.href, fake: true };
}
async function pending(state) {
  if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state)) fail('zoom_oauth_invalid', 400);
  const row = await M.ExternalConnection.findOne({ where: { provider: 'zoom', oauthStateHash: hash(state) } });
  if (!row?.oauthVerifier || !row.oauthExpiresAt || row.oauthExpiresAt <= new Date()) fail('zoom_oauth_invalid', 400);
  return row;
}
async function start(state, res) {
  adapter.assertFake(); const row = await pending(state);
  const c = cipher.decrypt(row.oauthVerifier);
  res.cookie(cookieName, state, { httpOnly: true, secure: redirect().protocol === 'https:', sameSite: 'lax',
    path: '/api/integrations/zoom/callback', maxAge: 600000 });
  const url = redirect(); url.search = new URLSearchParams({ state, code: c.code }).toString();
  return url.href;
}
async function callback(req) {
  adapter.assertFake();
  const state = req.query.state;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!cookie || typeof state !== 'string' || hash(cookie) !== hash(state)) fail('zoom_oauth_invalid', 400);
  const row = await pending(state);
  const user = await M.User.findByPk(row.userId); await teacher(user);
  const c = cipher.decrypt(row.oauthVerifier);
  if (req.query.error) fail('zoom_oauth_denied', 400);
  const credentials = await adapter.authorize({ code: req.query.code, expectedCode: c.code, verifier: c.verifier, accountId: hash(`${process.env.DB_NAME}:${user.id}:${user.email}`) });
  const [changed] = await M.ExternalConnection.update({ status: 'connected', credentials: cipher.encrypt(credentials), accountEmail: credentials.email,
    scopes: scope, tokenExpiresAt: new Date(credentials.expiresAt), oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null,
    lastError: null, refreshLockedUntil: null, version: row.version + 1 },
  { where: { id: row.id, version: row.version, oauthStateHash: hash(state) } });
  if (!changed) fail('zoom_oauth_invalid', 400);
  return row.userId;
}
async function credentials(userId) {
  adapter.assertFake();
  let row = await rowFor(userId);
  if (!row?.credentials || row.status !== 'connected') fail('integration_not_connected');
  if (row.tokenExpiresAt > new Date(Date.now() + 60000)) return { row, tokens: cipher.decrypt(row.credentials) };
  // CAS con lease: solo una réplica puede rotar el refresh token; ninguna llamada bajo lock SQL.
  const lease = new Date(Math.floor(Date.now() / 1000) * 1000 + 30000);
  const [claimed] = await M.ExternalConnection.update({ refreshLockedUntil: lease }, { where: { id: row.id, version: row.version, status: 'connected',
    [Op.or]: [{ refreshLockedUntil: null }, { refreshLockedUntil: { [Op.lt]: new Date() } }] } });
  if (!claimed) fail('zoom_busy', 503);
  try {
    const next = await adapter.refresh(cipher.decrypt(row.credentials));
    const [saved] = await M.ExternalConnection.update({ credentials: cipher.encrypt(next), tokenExpiresAt: new Date(next.expiresAt),
      refreshLockedUntil: null, version: row.version + 1, lastError: null }, { where: { id: row.id, version: row.version, status: 'connected', refreshLockedUntil: lease } });
    if (!saved) fail('integration_not_connected');
    row = await rowFor(userId); return { row, tokens: next };
  } catch (error) {
    await M.ExternalConnection.update({ refreshLockedUntil: null, ...(error.code === 'zoom_revoked' ? { status: 'revoked', credentials: null, lastError: 'zoom_revoked' } : {}) },
      { where: { id: row.id, version: row.version, refreshLockedUntil: lease } });
    throw error;
  }
}
async function status(user) {
  await teacher(user); const row = await rowFor(user.id);
  let capabilities = null;
  if (row?.status === 'connected' && process.env.INTEGRATIONS_FAKE === '1') {
    try { const c = await credentials(user.id); capabilities = await adapter.capabilities(c.tokens); }
    catch (error) { if (!['zoom_revoked', 'integration_not_connected', 'zoom_busy'].includes(error.code)) throw error; }
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
module.exports = { teacher, connect, start, callback, credentials, status, disconnect, cookieName, rowFor };
