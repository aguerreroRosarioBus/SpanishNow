// Servicio genérico sobre external_connections (W07; lo reutiliza W08). Independiente de google_connections:
// desconectar una no toca la otra (CAL-01, CAL-08). Las credenciales viven cifradas y nunca salen del servidor.
// Ninguna llamada de red ocurre dentro de una transacción con locks: el refresh se serializa con un lease
// (refreshLockedUntil) y la llamada al proveedor se hace fuera del lock.
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { ExternalConnection } = require('../models');
const { encrypt, decrypt } = require('./liveGoogleService');

class IntegrationError extends Error {
  // retryable: el outbox debe reintentar; needsAttention: la conexión requiere que la persona vuelva a autorizar.
  constructor(statusCode, code, params = {}, { retryable = false, needsAttention = false } = {}) {
    super(`Integración: ${code}`);
    this.statusCode = statusCode; this.code = code; this.params = params;
    this.retryable = retryable; this.needsAttention = needsAttention;
  }
}
const fail = (code, params = {}, status = 409, flags = {}) => { throw new IntegrationError(status, code, params, flags); };

const REFRESH_LEASE_MS = 30000;
const REFRESH_MARGIN_MS = 60000;
const REFRESH_WAIT_MS = 10000;
const OAUTH_TTL_MS = 10 * 60 * 1000;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const find = (userId, provider, options = {}) => ExternalConnection.findOne({ where: { userId, provider }, ...options });

/** Vista pública: nunca credenciales, verificador ni hashes. */
function view(row) {
  if (!row) return { status: 'disconnected', connected: false };
  return {
    status: row.status, connected: row.status === 'connected', accountEmail: row.accountEmail || null,
    targetCalendarId: row.targetCalendarId || null, busyCalendarIds: row.busyCalendarIds || [],
    lastError: row.lastError || null, version: row.version
  };
}

/** Prepara OAuth: state de un solo uso (solo su hash en base) + verificador PKCE cifrado. */
async function beginOAuth(userId, provider) {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const fields = { oauthStateHash: sha256(state), oauthVerifier: encrypt(verifier), oauthExpiresAt: new Date(Date.now() + OAUTH_TTL_MS) };
  const row = await find(userId, provider);
  // El estado de una conexión existente no cambia al reconectar: los datos pendientes viven en los campos oauth*.
  if (row) await row.update(fields);
  else await ExternalConnection.create({ userId, provider, status: 'pending', ...fields });
  return { state, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

const validState = state => typeof state === 'string' && /^[\w-]{43}$/.test(state);

/** Consume el state una sola vez (transaccional, incluso con dos callbacks simultáneos). */
async function consumeOAuth(provider, state) {
  if (!validState(state)) fail('oauth_state_invalid', {}, 400);
  return sequelize.transaction(async transaction => {
    const row = await ExternalConnection.findOne({ where: { provider, oauthStateHash: sha256(state) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row || !row.oauthVerifier || !row.oauthExpiresAt || new Date(row.oauthExpiresAt).getTime() < Date.now()) fail('oauth_state_invalid', {}, 400);
    const result = { connectionId: row.id, userId: row.userId, verifier: decrypt(row.oauthVerifier) };
    await row.update({ oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null }, { transaction });
    return result;
  });
}


const COMPLETION_TTL_MS = 5 * 60 * 1000;

/**
 * El callback del proveedor no tiene sesión: nada de lo que trae identifica a quién inició la conexión, y una cookie de
 * navegación tampoco (otra persona puede mandar el enlace de inicio a su víctima). Por eso el callback NO guarda
 * credenciales: las deja cifradas como «pendientes de confirmar» (reutiliza oauth* de la fila del que inició) con un
 * token de un solo uso y vida corta, y la persona autenticada las confirma con completePending.
 * Devuelve el token que viaja al frontend.
 */
async function stagePending(connectionId, tokens) {
  const token = crypto.randomBytes(32).toString('base64url');
  await ExternalConnection.update({ oauthStateHash: sha256(token), oauthVerifier: encrypt({ kind: 'completion', tokens }),
    oauthExpiresAt: new Date(Date.now() + COMPLETION_TTL_MS) }, { where: { id: connectionId } });
  return token;
}

/**
 * Consume el pendiente (una sola vez, transaccional). { ok: true, connectionId, tokens } si quien confirma es quien inició;
 * { ok: false, tokens } si es otra persona: el pendiente se descarta y la conexión del que inició no cambia (el llamador
 * decide si revoca esos tokens). Token inexistente, usado o vencido → 400 oauth_state_invalid.
 */
async function completePending(provider, token, userId) {
  if (!validState(token)) fail('oauth_state_invalid', {}, 400);
  return sequelize.transaction(async transaction => {
    const row = await ExternalConnection.findOne({ where: { provider, oauthStateHash: sha256(token) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row?.oauthVerifier || !row.oauthExpiresAt || new Date(row.oauthExpiresAt).getTime() < Date.now()) fail('oauth_state_invalid', {}, 400);
    let payload;
    try { payload = decrypt(row.oauthVerifier); } catch { fail('oauth_state_invalid', {}, 400); }
    if (payload?.kind !== 'completion') fail('oauth_state_invalid', {}, 400);
    await row.update({ oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null }, { transaction });
    return row.userId === userId ? { ok: true, connectionId: row.id, tokens: payload.tokens } : { ok: false, tokens: payload.tokens };
  });
}

/** Guarda la autorización obtenida: credenciales cifradas y estado conectado. Un grant nuevo reemplaza al anterior. */
async function saveCredentials(connectionId, { accessToken, refreshToken, expiresIn, scopes, accountEmail }, extra = {}) {
  const expiresAt = Date.now() + (expiresIn || 3600) * 1000;
  const row = await ExternalConnection.findByPk(connectionId);
  await row.update({
    credentials: encrypt({ accessToken, refreshToken, expiresAt }), tokenExpiresAt: new Date(expiresAt), refreshLockedUntil: null,
    scopes, accountEmail: accountEmail ? String(accountEmail).slice(0, 254) : row.accountEmail, status: 'connected', lastError: null,
    version: row.version + 1, ...extra
  });
  return row;
}

async function markNeedsAttention(connectionId, code, status = 'needs_attention') {
  await ExternalConnection.update({ status, lastError: String(code).slice(0, 500), refreshLockedUntil: null, version: sequelize.literal('version + 1') },
    { where: { id: connectionId, status: { [Op.in]: ['connected', 'needs_attention'] } } });
}

/**
 * Token de acceso vigente. Refresh serializado entre réplicas: quien lo necesita toma el lease bajo lock de fila,
 * refresca fuera del lock y guarda; las demás esperan y releen. `refresher(refreshToken)` →
 * { accessToken, expiresIn, refreshToken? }; lanza IntegrationError con needsAttention si la autorización murió.
 */
async function accessToken(connectionId, refresher) {
  const deadline = Date.now() + REFRESH_WAIT_MS;
  for (;;) {
    const claim = await sequelize.transaction(async transaction => {
      const row = await ExternalConnection.findByPk(connectionId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row?.credentials || !['connected'].includes(row.status)) fail('integration_not_connected', {}, 409);
      let credentials;
      // Una clave de cifrado rotada o credenciales corruptas no son un fallo transitorio: hay que volver a conectar.
      try { credentials = decrypt(row.credentials); } catch { return { lost: true }; }
      if (credentials.expiresAt > Date.now() + REFRESH_MARGIN_MS) return { token: credentials.accessToken };
      if (row.refreshLockedUntil && new Date(row.refreshLockedUntil).getTime() > Date.now()) return { wait: true };
      const lease = new Date(Date.now() + REFRESH_LEASE_MS);
      await row.update({ refreshLockedUntil: lease }, { transaction });
      return { credentials, lease };
    });
    if (claim.lost) {
      await markNeedsAttention(connectionId, 'authorization_lost');
      fail('authorization_lost', {}, 409, { needsAttention: true });
    }
    if (claim.token) return claim.token;
    if (claim.wait) {
      if (Date.now() > deadline) fail('provider_unavailable', { reason: 'refresh_in_progress' }, 503, { retryable: true });
      await sleep(100);
      continue;
    }
    let renewed;
    try {
      renewed = await refresher(claim.credentials.refreshToken);
    } catch (error) {
      await ExternalConnection.update({ refreshLockedUntil: null }, { where: { id: connectionId, refreshLockedUntil: claim.lease } });
      if (error instanceof IntegrationError && error.needsAttention) await markNeedsAttention(connectionId, error.code, error.code === 'authorization_revoked' ? 'revoked' : 'needs_attention');
      throw error;
    }
    const credentials = { ...claim.credentials, accessToken: renewed.accessToken, expiresAt: Date.now() + (renewed.expiresIn || 3600) * 1000 };
    if (renewed.refreshToken) credentials.refreshToken = renewed.refreshToken;
    // Solo guarda si el lease sigue siendo nuestro (si se desconectó mientras tanto, no se resucita la conexión).
    const [saved] = await ExternalConnection.update({ credentials: encrypt(credentials), tokenExpiresAt: new Date(credentials.expiresAt), refreshLockedUntil: null },
      { where: { id: connectionId, status: 'connected', refreshLockedUntil: claim.lease } });
    if (!saved) fail('integration_not_connected', {}, 409);
    return credentials.accessToken;
  }
}

/** Descifra el refresh token para revocarlo en el proveedor; nunca lo devuelve a un cliente. */
async function refreshTokenOf(row) {
  if (!row?.credentials) return null;
  try { return decrypt(row.credentials).refreshToken; } catch { return null; }
}

/** Desconecta sin tocar google_connections, sesiones ni historial: borra credenciales y marca el estado. */
async function disconnect(row, status = 'disconnected') {
  await row.update({ credentials: null, tokenExpiresAt: null, refreshLockedUntil: null, oauthStateHash: null, oauthVerifier: null,
    oauthExpiresAt: null, status, lastError: null, version: row.version + 1 });
}

module.exports = { IntegrationError, fail, find, view, beginOAuth, consumeOAuth, stagePending, completePending, saveCredentials, markNeedsAttention, accessToken, refreshTokenOf, disconnect, sha256, sleep };
