// Sincronización de clases con Google Calendar (W07, CAL-02, CAL-04…CAL-07). SpanishNow gobierna el horario:
// cada sesión confirmada tiene un evento en el calendario destino del docente, creado/actualizado/cancelado por el
// outbox (`calendar.sync`). El evento tiene un id determinista derivado del correlationKey de la ref, así que un
// timeout o un reintento nunca duplica; lo que se cambie desde Google se detecta (`calendar.reconcile`), se avisa y
// se resuelve desde la aplicación, nunca mueve ni confirma una clase.
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const M = require('../models');
const features = require('../config/features');
const outbox = require('./outbox');
const connections = require('./externalConnections');
const calendar = require('./googleCalendarService');
const { adapter } = require('./googleCalendar');

const { IntegrationError } = connections;
const PROVIDER = calendar.PROVIDER;
const FINAL = ['cancelled', 'expired', 'declined'];
const CHANNEL_RENEW_MARGIN_MS = 24 * 3600e3;
const CHANNEL_TTL_SECONDS = 7 * 24 * 3600;
const MAX_ROUNDS = 3;

// base32hex en minúscula (alfabeto que Google acepta para ids de evento), 26 caracteres desde un hash de la clave.
function eventIdFor(correlationKey) {
  const alphabet = '0123456789abcdefghijklmnopqrstuv';
  const bytes = crypto.createHash('sha256').update(correlationKey).digest().subarray(0, 16);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let id = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) id += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return id;
}

const TEXT = {
  es: { summary: 'Clase de español · SpanishNow', details: 'Gestiona la clase desde SpanishNow (no cambies el horario desde este calendario).', zoom: 'Enlace de Zoom' },
  en: { summary: 'Spanish class · SpanishNow', details: 'Manage this class in SpanishNow (do not change the time from this calendar).', zoom: 'Zoom link' }
};

/** Evento normalizado de una sesión. Sin mensajes privados, sin enlace de anfitrión, sin importes (CAL-04/05). */
async function buildEvent(session, ref) {
  const teacher = await M.User.findByPk(session.teacherId, { attributes: ['id', 'locale'] });
  const text = TEXT[teacher?.locale === 'en' ? 'en' : 'es'];
  const seats = await M.ClassSessionParticipant.findAll({ where: { sessionId: session.id, status: { [Op.ne]: 'cancelled' } } });
  const students = await M.User.findAll({ where: { id: seats.map(s => s.userId) }, attributes: ['id', 'email'] });
  const zoom = await M.ExternalSyncRef.findOne({ where: { sessionId: session.id, provider: 'zoom', status: 'ready' }, attributes: ['joinUrl'] });
  const link = `${calendar.frontendUrl()}/schedule`;
  const lines = [text.details, link];
  // Solo el enlace de participante; el de anfitrión nunca se guarda ni se envía aquí.
  if (zoom?.joinUrl && /^https:\/\/([\w-]+\.)*zoom\.us\//.test(zoom.joinUrl)) lines.push(`${text.zoom}: ${zoom.joinUrl}`);
  return {
    id: eventIdFor(ref.correlationKey), summary: text.summary, description: lines.join('\n\n'),
    startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), timeZone: session.timeZone,
    attendees: [...new Set(students.map(s => s.email).filter(Boolean))], correlationKey: ref.correlationKey, sessionId: session.id, version: session.version, url: link
  };
}

const sameInstant = (a, b) => Boolean(a && b) && Date.parse(a) === Date.parse(b);

async function markRef(ref, status, lastError, extra = {}) { await ref.update({ status, lastError, ...extra }); }

/**
 * Converge el evento de Google con la sesión vigente. Idempotente: se puede ejecutar dos veces o desde dos réplicas.
 * `force`: reintento explícito del docente (recrea un evento borrado desde Google). Nunca confirma ni mueve clases.
 */
async function syncSession(sessionId, { force = false, job = null } = {}) {
  let connectionId = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const session = await M.ClassSession.findByPk(sessionId);
    const ref = session && await M.ExternalSyncRef.findOne({ where: { sessionId, provider: PROVIDER } });
    if (!ref) return 'gone';
    if (job && job.aggregateVersion && job.aggregateVersion < session.version && round === 0) {
      // Hay un job más nuevo para esta sesión; él converge al estado vigente.
      const newer = await M.OutboxJob.count({ where: { topic: 'calendar.sync', aggregateType: 'class_sessions', aggregateId: sessionId,
        aggregateVersion: { [Op.gt]: job.aggregateVersion }, status: { [Op.in]: ['pending', 'running'] } } });
      if (newer) return 'superseded';
    }
    const connection = await connections.find(session.teacherId, PROVIDER);
    if (!features.isEnabled('google_calendar') || !connection || connection.status !== 'connected') {
      await markRef(ref, 'needs_attention', 'integration_not_connected');
      return 'not_connected';
    }
    if (!['confirmed', ...FINAL].includes(session.status)) return 'not_applicable';
    if (session.status === 'confirmed' && ref.status === 'needs_attention' && ref.lastError === 'external_deleted' && !force) return 'awaiting_resolution';
    connectionId = connection.id;
    const calendarId = ref.calendarId || connection.targetCalendarId || 'primary';
    try {
      if (FINAL.includes(session.status)) {
        if (ref.externalId) await calendar.call(connection, (api, token) => api.deleteEvent(token, calendarId, ref.externalId));
        await M.ExternalSyncRef.update({ status: 'cancelled', syncedVersion: session.version, etag: null, lastError: null, attempts: 0, connectionId: connection.id },
          { where: { id: ref.id, syncedVersion: { [Op.lte]: session.version } } });
      } else {
        const event = await buildEvent(session, ref);
        const written = await calendar.call(connection, async (api, token) => {
          if (ref.externalId) {
            const remote = await api.getEvent(token, calendarId, ref.externalId);
            if (!remote || remote.cancelled) {
              if (!force) { const gone = new IntegrationError(409, 'external_deleted'); gone.deleted = true; throw gone; }
            }
            return api.patchEvent(token, calendarId, ref.externalId, event).catch(error => {
              if (error.code === 'event_gone') return api.insertEvent(token, calendarId, event);
              throw error;
            });
          }
          try { return await api.insertEvent(token, calendarId, event); } catch (error) {
            // Un intento anterior sí llegó a Google (timeout): se adopta el mismo evento en vez de crear otro.
            if (error.code !== 'event_exists') throw error;
            return api.patchEvent(token, calendarId, event.id, event);
          }
        });
        await M.ExternalSyncRef.update({ externalId: event.id, calendarId, etag: written?.etag || null, syncedVersion: session.version, status: 'ready',
          lastError: null, attempts: 0, connectionId: connection.id }, { where: { id: ref.id, syncedVersion: { [Op.lte]: session.version } } });
      }
    } catch (error) {
      if (!(error instanceof IntegrationError)) throw error;
      if (error.deleted) { await markRef(ref, 'needs_attention', 'external_deleted'); return 'external_deleted'; }
      if (error.retryable) {
        const exhausted = job && job.attempts + 1 >= job.maxAttempts;
        await ref.update({ attempts: ref.attempts + 1, lastError: exhausted ? 'sync_failed' : error.code, ...(exhausted ? { status: 'needs_attention' } : {}) });
        throw error;
      }
      await markRef(ref, 'needs_attention', error.needsAttention ? 'authorization_lost' : error.code);
      return 'needs_attention';
    }
    // Si la sesión cambió mientras escribíamos, otra ronda; si no, listo.
    const latest = await M.ClassSession.findByPk(sessionId, { attributes: ['version', 'startsAt', 'endsAt'] });
    if (latest.version === session.version && sameInstant(latest.startsAt, session.startsAt)) break;
  }
  if (connectionId) await calendar.scheduleTick(connectionId).catch(() => {});
  return 'synced';
}

// ---- Cambios hechos desde Google (CAL-06/CAL-07) -------------------------------------------------------------

async function inspectEvents(connection, calendarId, events) {
  const refs = await M.ExternalSyncRef.findAll({ where: { provider: PROVIDER, connectionId: connection.id, calendarId, externalId: events.map(e => e.id) },
    include: [{ model: M.ClassSession, as: 'session', required: true }] });
  for (const event of events) {
    const ref = refs.find(r => r.externalId === event.id);
    if (!ref || ref.status === 'cancelled' || ref.session.status !== 'confirmed') continue;
    // Si hay una escritura nuestra pendiente, el evento remoto todavía no refleja el estado vigente: no es una divergencia.
    const inFlight = ref.syncedVersion < ref.session.version || await M.OutboxJob.count({ where: { topic: 'calendar.sync', aggregateType: 'class_sessions',
      aggregateId: ref.sessionId, status: { [Op.in]: ['pending', 'running'] } } });
    if (inFlight) continue;
    if (event.cancelled) { await markRef(ref, 'needs_attention', 'external_deleted'); continue; }
    if (!sameInstant(event.startsAt, ref.session.startsAt) || !sameInstant(event.endsAt, ref.session.endsAt)) { await markRef(ref, 'needs_attention', 'external_changed', { etag: event.etag }); continue; }
    // Coincide con la sesión: se cura una alerta previa o solo se actualiza el etag (p. ej. una respuesta RSVP).
    const healed = ref.status === 'needs_attention' && ['external_changed', 'external_deleted'].includes(ref.lastError);
    if (healed || ref.etag !== event.etag) await ref.update({ etag: event.etag, ...(healed ? { status: 'ready', lastError: null } : {}) });
  }
}

async function ensureChannel(connection, calendarId, api, token) {
  const [row] = await M.ExternalCalendarChannel.findOrCreate({ where: { connectionId: connection.id, calendarId } });
  const address = process.env.GOOGLE_CALENDAR_NOTIFICATIONS_URL;
  if (!address) return row;
  if (row.channelId && row.expiresAt && row.expiresAt.getTime() - Date.now() > CHANNEL_RENEW_MARGIN_MS) return row;
  const channelId = `sn${crypto.randomBytes(16).toString('hex')}`;
  const channelToken = crypto.randomBytes(24).toString('base64url');
  const created = await api.watch(token, calendarId, { channelId, token: channelToken, address, ttlSeconds: CHANNEL_TTL_SECONDS });
  const previous = row.channelId && { channelId: row.channelId, resourceId: row.resourceId };
  await row.update({ channelId, resourceId: created.resourceId, tokenHash: connections.sha256(channelToken), expiresAt: created.expiresAt, lastMessageNumber: 0 });
  if (previous) await api.stopChannel(token, previous).catch(() => {});
  return row;
}

async function reconcileCalendar(connection, calendarId) {
  let channel = await calendar.call(connection, (api, token) => ensureChannel(connection, calendarId, api, token));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { events, nextSyncToken } = await calendar.call(connection, (api, token) => api.listChanges(token, calendarId, channel.syncToken || undefined));
      await inspectEvents(connection, calendarId, events);
      await channel.update({ syncToken: nextSyncToken, lastSyncedAt: new Date() });
      return;
    } catch (error) {
      // 410: el token de sync caducó. Se resincroniza completo sin borrar sesiones ni duplicar eventos.
      if (!(error instanceof IntegrationError) || error.code !== 'sync_token_expired' || attempt) throw error;
      await channel.update({ syncToken: null });
      channel = await channel.reload();
    }
  }
}

/** Reconciliación periódica o disparada por una notificación. La cadena de sondeo se reprograma siempre. */
async function reconcile(connectionId, { tick = false } = {}) {
  try {
    const connection = await M.ExternalConnection.findByPk(connectionId);
    if (!connection || connection.status !== 'connected' || !features.isEnabled('google_calendar')) return;
    const refCalendars = await M.ExternalSyncRef.findAll({ where: { provider: PROVIDER, connectionId, calendarId: { [Op.ne]: null }, status: { [Op.in]: ['ready', 'pending', 'needs_attention'] } },
      attributes: ['calendarId'], group: ['calendarId'] });
    const calendarIds = [...new Set([connection.targetCalendarId, ...refCalendars.map(r => r.calendarId)].filter(Boolean))];
    for (const calendarId of calendarIds) await reconcileCalendar(connection, calendarId);
  } finally {
    if (tick) await calendar.scheduleTick(connectionId).catch(() => {});
  }
}

/** POST /notifications: valida canal, token y recurso; descarta repetidos; encola y responde. Nunca confía en el cuerpo. */
async function notification(headers) {
  const channelId = headers['x-goog-channel-id'], channelToken = headers['x-goog-channel-token'], resourceId = headers['x-goog-resource-id'];
  const state = headers['x-goog-resource-state'], number = Number(headers['x-goog-message-number']);
  if (typeof channelId !== 'string' || typeof channelToken !== 'string' || typeof resourceId !== 'string' || !Number.isSafeInteger(number) || number < 1) return 404;
  const channel = await M.ExternalCalendarChannel.findOne({ where: { channelId } });
  const expected = channel?.tokenHash || '';
  const given = connections.sha256(channelToken);
  if (!channel || expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given)) || channel.resourceId !== resourceId) return 404;
  // Anti-replay: solo avanza el número de mensaje del canal (atómico entre réplicas).
  const [advanced] = await M.ExternalCalendarChannel.update({ lastMessageNumber: number }, { where: { id: channel.id, lastMessageNumber: { [Op.lt]: number } } });
  if (!advanced || state === 'sync') return 200;
  await outbox.enqueue({ topic: 'calendar.reconcile', aggregateType: 'external_connections', aggregateId: channel.connectionId,
    dedupeKey: `calendar.reconcile:${channel.connectionId}:push:${channel.id}:${number}`, payload: { tick: false } });
  return 200;
}

outbox.register('calendar.sync', async job => {
  // Una limpieza de cuentas puede haber eliminado la sesión mientras el job esperaba.
  await syncSession(job.aggregateId, { force: Boolean(job.payload?.force), job });
});
outbox.register('calendar.reconcile', async job => { await reconcile(job.aggregateId, { tick: Boolean(job.payload?.tick) }); });

module.exports = { eventIdFor, buildEvent, syncSession, reconcile, inspectEvents, notification };
