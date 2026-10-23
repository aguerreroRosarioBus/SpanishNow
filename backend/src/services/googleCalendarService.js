// Google Calendar del docente (W07, CAL-01…CAL-03, CAL-08): conexión, calendarios elegidos y ocupación.
// Habla con Google solo a través del puerto ./googleCalendar y nunca dentro de una transacción con locks.
// Permisos mínimos: eventos propios, free/busy y lista de calendarios. Independiente de google_connections (Drive/Classroom).
const { Op } = require('sequelize');
const M = require('../models');
const features = require('../config/features');
const outbox = require('./outbox');
const connections = require('./externalConnections');
const { adapter } = require('./googleCalendar');

const PROVIDER = 'google_calendar';
const { IntegrationError } = connections;
const redirectUri = () => process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/api/integrations/google-calendar/callback';
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
// Estados en los que existe una autorización que ya no vale o está en riesgo: no se confirma sin leer la ocupación.
const REQUIRES_CHECK = ['connected', 'needs_attention', 'revoked'];
const TICK_MS = () => (process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL ? 30 : 5) * 60000;

/** Ejecuta una llamada al proveedor con token vigente; si la autorización murió marca la conexión y relanza. */
async function call(connection, fn) {
  const api = adapter();
  const token = await connections.accessToken(connection.id, api.refresh);
  try { return await fn(api, token); } catch (error) {
    if (error instanceof IntegrationError && error.needsAttention) {
      await connections.markNeedsAttention(connection.id, error.code, error.code === 'authorization_revoked' ? 'revoked' : 'needs_attention');
    }
    throw error;
  }
}

async function ownConnection(user) {
  if (user.role !== 'teacher') throw new IntegrationError(403, 'forbidden');
  return connections.find(user.id, PROVIDER);
}

/** Estado para la pantalla: cuenta, calendarios disponibles y elegidos. Nunca credenciales. */
async function status(user) {
  const row = await ownConnection(user);
  const body = { provider: PROVIDER, enabled: features.isEnabled('google_calendar'), fake: features.integrationsFake(), ...connections.view(row), calendars: [] };
  if (row?.status === 'connected') {
    try { body.calendars = await call(row, (api, token) => api.listCalendars(token)); } catch (error) {
      if (!(error instanceof IntegrationError)) throw error;
      body.calendarsError = error.code;
      const fresh = await connections.find(user.id, PROVIDER);
      Object.assign(body, connections.view(fresh));
    }
  }
  return body;
}

/** /connect devuelve una URL de primera parte (/start): allí se fija la cookie que ata el callback a este navegador. */
async function connect(user) {
  if (user.role !== 'teacher') throw new IntegrationError(403, 'forbidden');
  const { state } = await connections.beginOAuth(user.id, PROVIDER);
  const start = new URL('start', redirectUri());
  start.searchParams.set('state', state);
  return { url: start.href };
}

const cookiePath = () => new URL('.', redirectUri()).pathname.replace(/\/$/, '');

/** GET /start: sin sesión (navegación del navegador); devuelve la URL del proveedor y la cookie de enlace. */
async function start(state) {
  const challenge = await connections.pendingChallenge(PROVIDER, state);
  return { location: adapter().authUrl({ state, challenge, redirectUri: redirectUri() }),
    cookie: connections.bindingCookie(PROVIDER, state, { path: cookiePath(), secure: new URL(redirectUri()).protocol === 'https:' }) };
}

/** Redirección final al frontend. Los errores viajan como código estable, nunca como texto del proveedor. */
const done = outcome => `${frontendUrl()}/teacher/integrations?calendar=${encodeURIComponent(outcome)}`;

async function callback(query, cookieHeader) {
  let pending;
  // Sin la cookie de /start de este navegador el state no se consume: otra persona no puede ni vincular ni quemar la conexión.
  if (!connections.matchesBinding(PROVIDER, query.state, cookieHeader)) return done('error');
  try { pending = await connections.consumeOAuth(PROVIDER, query.state); } catch { return done('error'); }
  if (query.error || typeof query.code !== 'string' || query.code.length > 4096) return done('denied');
  let tokens;
  try { tokens = await adapter().exchangeCode({ code: query.code, verifier: pending.verifier }); } catch (error) {
    return done(error instanceof IntegrationError && error.code === 'oauth_scopes_missing' ? 'scopes' : 'error');
  }
  const row = await M.ExternalConnection.findByPk(pending.connectionId);
  const saved = await connections.saveCredentials(row.id, tokens, {
    targetCalendarId: row.targetCalendarId || 'primary', busyCalendarIds: row.busyCalendarIds?.length ? row.busyCalendarIds : [row.targetCalendarId || 'primary']
  });
  await recover(saved);
  return done('connected');
}

/** Tras (re)conectar: sesiones futuras que quedaron sin sincronizar se reencolan; el id determinista evita duplicar eventos. */
async function recover(connection) {
  const refs = await M.ExternalSyncRef.findAll({ where: { provider: PROVIDER, status: { [Op.in]: ['needs_attention', 'pending'] } },
    include: [{ model: M.ClassSession, as: 'session', required: true, where: { teacherId: connection.userId, status: 'confirmed', endsAt: { [Op.gt]: new Date() } } }] });
  for (const ref of refs) {
    await ref.update({ status: 'pending', lastError: null, attempts: 0 });
    await outbox.enqueue({ topic: 'calendar.sync', aggregateType: 'class_sessions', aggregateId: ref.sessionId, aggregateVersion: ref.session.version,
      dedupeKey: `calendar.sync:${ref.sessionId}:v${ref.session.version}:reconnect:${connection.version}`, payload: { force: true } });
  }
  await scheduleTick(connection.id);
}

/** Un solo job de sondeo/renovación por ventana de tiempo (cadena durable; sobrevive reinicios). */
async function scheduleTick(connectionId, { transaction } = {}) {
  const interval = TICK_MS();
  const runAt = new Date(Math.ceil((Date.now() + 1) / interval) * interval);
  return outbox.enqueue({ topic: 'calendar.reconcile', aggregateType: 'external_connections', aggregateId: connectionId,
    dedupeKey: `calendar.reconcile:${connectionId}:tick:${runAt.getTime()}`, payload: { tick: true }, runAt }, { transaction });
}

const validCalendar = (calendars, id) => typeof id === 'string' && id.length > 0 && id.length <= 255 && calendars.some(c => c.id === id);

/** PATCH { targetCalendarId, busyCalendarIds }: el destino debe poder escribirse; los de ocupación solo leerse. */
async function update(user, body = {}) {
  const row = await ownConnection(user);
  if (!row || row.status !== 'connected') throw new IntegrationError(409, 'integration_not_connected');
  const invalid = fields => { throw new IntegrationError(400, 'validation_failed', { fields }); };
  if (body.version !== undefined && body.version !== row.version) throw new IntegrationError(409, 'version_conflict', { version: row.version });
  const calendars = await call(row, (api, token) => api.listCalendars(token));
  const patch = {};
  if (body.targetCalendarId !== undefined) {
    const target = calendars.find(c => c.id === body.targetCalendarId);
    if (!target) invalid(['targetCalendarId']);
    if (!['owner', 'writer'].includes(target.accessRole)) invalid(['targetCalendarId']);
    patch.targetCalendarId = target.id;
  }
  if (body.busyCalendarIds !== undefined) {
    if (!Array.isArray(body.busyCalendarIds) || body.busyCalendarIds.length > 10 || !body.busyCalendarIds.every(id => validCalendar(calendars, id))) invalid(['busyCalendarIds']);
    patch.busyCalendarIds = [...new Set(body.busyCalendarIds)];
  }
  if (!Object.keys(patch).length) invalid(['targetCalendarId', 'busyCalendarIds']);
  // El calendario destino también ocupa: citas puestas allí por el docente bloquean horarios.
  const target = patch.targetCalendarId || row.targetCalendarId;
  const busy = patch.busyCalendarIds || row.busyCalendarIds || [];
  patch.busyCalendarIds = [...new Set([target, ...busy])].filter(Boolean);
  await row.update({ ...patch, version: row.version + 1 });
  return status(user);
}

/** Desconectar deja sesiones, historial y eventos ya creados intactos; solo detiene futuras actualizaciones (CAL-08). */
async function disconnect(user) {
  const row = await ownConnection(user);
  if (!row) return connections.view(null);
  const token = await connections.refreshTokenOf(row);
  const channels = await M.ExternalCalendarChannel.findAll({ where: { connectionId: row.id } });
  if (row.status === 'connected') {
    // Mejor esfuerzo: parar canales y revocar. Si Google no responde, igual se desconecta localmente.
    for (const channel of channels.filter(c => c.channelId)) await call(row, (api, t) => api.stopChannel(t, channel)).catch(() => {});
  }
  if (token) await adapter().revoke(token).catch(() => {});
  await M.ExternalCalendarChannel.destroy({ where: { connectionId: row.id } });
  await connections.disconnect(row);
  await M.ExternalSyncRef.update({ status: 'needs_attention', lastError: 'integration_not_connected' },
    { where: { provider: PROVIDER, connectionId: row.id, status: { [Op.in]: ['pending', 'ready'] } } });
  await M.OutboxJob.update({ status: 'cancelled' }, { where: { topic: 'calendar.reconcile', aggregateType: 'external_connections', aggregateId: row.id, status: 'pending' } });
  return connections.view(await M.ExternalConnection.findByPk(row.id));
}

/**
 * CAL-03: ocupación externa en el intervalo [startsAt, endsAt) de los calendarios elegidos. Se lee en el momento (nada
 * cacheado) y un fallo de lectura nunca equivale a «libre». `own`: intervalo del evento propio que se está moviendo.
 * Devuelve { checked } o lanza 409 schedule_conflict / 503 provider_unavailable.
 */
async function assertAvailable({ teacherId, startsAt, endsAt, own = null }) {
  if (!features.isEnabled('google_calendar')) return { checked: false };
  const row = await connections.find(teacherId, PROVIDER);
  if (!row || !REQUIRES_CHECK.includes(row.status)) return { checked: false };
  if (row.status !== 'connected') throw new IntegrationError(503, 'provider_unavailable', { reason: 'integration_needs_attention' });
  const calendarIds = [...new Set([row.targetCalendarId, ...(row.busyCalendarIds || [])].filter(Boolean))];
  let busy;
  try {
    busy = await call(row, (api, token) => api.freeBusy(token, { calendarIds, timeMin: new Date(startsAt).toISOString(), timeMax: new Date(endsAt).toISOString() }));
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error;
    throw new IntegrationError(503, 'provider_unavailable', { reason: error.needsAttention ? 'integration_needs_attention' : 'availability_check_failed' });
  }
  const ownFrom = own && Date.parse(own.startsAt), ownTo = own && Date.parse(own.endsAt);
  // Se ignora lo que cae por completo dentro del evento propio (la clase que se mueve), sin revelar títulos ajenos.
  const external = busy.filter(b => !(own && Date.parse(b.start) >= ownFrom && Date.parse(b.end) <= ownTo));
  if (external.length) throw new IntegrationError(409, 'schedule_conflict', { reason: 'external_busy' });
  return { checked: true };
}

module.exports = { PROVIDER, REQUIRES_CHECK, call, status, connect, start, callback, cookiePath, recover, scheduleTick, update, disconnect, assertAvailable, redirectUri, frontendUrl, TICK_MS };
