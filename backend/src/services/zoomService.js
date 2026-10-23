const crypto = require('node:crypto');
const { Op } = require('sequelize');
const db = require('../config/database');
const M = require('../models');
const adapter = require('./zoomAdapter');
const connection = require('./zoomConnection');
const outbox = require('./outbox');
const features = require('../config/features');
const { fail } = adapter;
const terminal = ['cancelled', 'declined', 'expired'];
const id = value => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) fail('not_found', 404); return n; };
function participantUrl(value, legacy = false) {
  let url;
  try { url = new URL(value); } catch { fail('zoom_invalid_link', 400); }
  if (url.protocol !== 'https:' || (url.hostname !== 'zoom.us' && !url.hostname.endsWith('.zoom.us'))
    || url.username || url.password || url.port || url.hash || !(legacy ? /^\/j\/\d{1,12}$/ : /^\/j\/\d{8,12}$/).test(url.pathname)
    || [...url.searchParams.keys()].some(k => k !== 'pwd') || url.searchParams.getAll('pwd').length > 1 || url.href.length > 1000) fail('zoom_invalid_link', 400);
  return url.href;
}
async function visible(user, sessionId, { owner = false, support = false } = {}) {
  const session = await M.ClassSession.findByPk(id(sessionId));
  if (!session) fail('not_found', 404);
  const seat = await M.ClassSessionParticipant.findOne({ where: { sessionId: session.id, userId: user.id } });
  const isOwner = user.id === session.teacherId && user.role === 'teacher';
  const canSupport = support && require('../config/permissions').hasPermission(user, 'class_sessions.support');
  if (!isOwner && !canSupport && (!seat || owner)) fail('not_found', 404);
  return { session, seat, isOwner };
}
// Exclusión por sesión entre jobs/versiones y procesos. El lock es de conexión, sin transacción ni locks de negocio
// durante llamadas al adaptador. MySQL lo libera si el worker muere.
async function exclusive(sessionId, fn) {
  const raw = await db.connectionManager.getConnection({ type: 'WRITE' });
  const key = `zoom:${adapter.hash(process.env.DB_NAME || 'spanishnow').slice(0, 16)}:${sessionId}`;
  let acquired = false;
  try {
    const [rows] = await raw.promise().query('SELECT GET_LOCK(?, 0) AS acquired', [key]);
    acquired = rows[0].acquired === 1;
    if (!acquired) fail('zoom_busy', 503);
    return await fn();
  } finally {
    try { if (acquired) await raw.promise().query('SELECT RELEASE_LOCK(?)', [key]); }
    finally { await db.connectionManager.releaseConnection(raw); }
  }
}
async function assertCapacity(teacherId, minutes, participants = 1, { preflight = false } = {}) {
  const row = await connection.rowFor(teacherId);
  if (row?.status !== 'connected') {
    if (preflight) return;
    fail('integration_not_connected');
  }
  // La sala de espera no se exige por defecto de la cuenta: cada reunión la activa y se verifica tras crearla/actualizarla.
  // El preflight siempre usa la copia persistida. No descifra ni refresca tokens y no hace llamadas a Zoom.
  const capability = row.capabilities;
  if (!capability || !Number.isFinite(capability.maxMinutes) || !Number.isFinite(capability.maxParticipants)
    || !Number.isFinite(capability.concurrentMeetings) || capability.concurrentMeetings < 1
    || !capability.passcodeRequired || capability.plan === 'unknown') fail('zoom_capacity_unknown');
  if (minutes > capability.maxMinutes || participants + 1 > capability.maxParticipants) fail('zoom_capacity_exceeded', 409,
    { maxMinutes: capability.maxMinutes, maxParticipants: capability.maxParticipants });
}
async function enqueue(session, transaction, reason = 'retry') {
  return outbox.enqueue({ topic: 'zoom.sync', aggregateType: 'class_sessions', aggregateId: session.id, aggregateVersion: session.version,
    dedupeKey: `zoom:${reason}:${session.id}:v${session.version}:${crypto.randomUUID()}` }, { transaction });
}
function safeError(error) {
  return ['provider_unavailable', 'zoom_provider_unavailable', 'zoom_revoked', 'zoom_authorization_lost', 'zoom_busy', 'zoom_capacity_unknown', 'zoom_capacity_exceeded', 'zoom_waiting_room_disabled', 'zoom_meeting_missing', 'integration_not_connected', 'zoom_rate_limited'].includes(error.code)
    ? error.code : 'zoom_provider_unavailable';
}
async function sync(job, ctx = { stillOwned: async () => true }) {
  const sessionId = id(job.aggregateId);
  return exclusive(sessionId, async () => {
    let session = await M.ClassSession.findByPk(sessionId);
    if (!session || !['confirmed', ...terminal].includes(session.status)) return;
    let ref;
    try {
      adapter.assertConfigured();
      const [found] = await M.ExternalSyncRef.findOrCreate({ where: { sessionId, provider: 'zoom' }, defaults: { correlationKey: `zoom:session:${sessionId}` } });
      ref = found;
      const c = await connection.credentials(session.teacherId);
      const row = c.row;
      let tokens = c.tokens;
      // Un cambio de cuenta no reutiliza una reunión del docente en su grant anterior.
      if (ref.connectionId && ref.connectionId !== row.id) fail('zoom_revoked');
      const seats = await M.ClassSessionParticipant.count({ where: { sessionId, status: { [Op.ne]: 'cancelled' } } });
      if (session.status === 'confirmed') await assertCapacity(session.teacherId, session.minutes, seats);
      if (!await ctx.stillOwned()) fail('zoom_busy', 503);
      const before = `${session.version}:${session.status}:${session.startsAt?.getTime()}`;
      // Se reconcilia SIEMPRE por correlación antes de crear; el endpoint create no promete idempotencia.
      const providerCall = async (method, ...args) => {
        const result = await connection.withCredentials(session.teacherId, tokens, currentTokens => adapter[method](currentTokens, ...args));
        tokens = result.tokens;
        return result.value;
      };
      const existing = await providerCall('find', ref.correlationKey);
      let meeting = existing;
      if (terminal.includes(session.status)) {
        if (existing) await providerCall('remove', existing.id);
      } else {
        const wanted = { correlationKey: ref.correlationKey, startsAt: session.startsAt.toISOString(), timeZone: 'UTC',
          minutes: session.minutes, sessionVersion: session.version, settings: { waitingRoom: true, passcodeRequired: true, autoRecording: 'none', joinBeforeHost: false } };
        meeting = existing ? await providerCall('update', existing.id, wanted) : await providerCall('create', wanted);
        // Si Zoom (o la cuenta) forzó la sala de espera apagada, la clase no queda lista.
        if (meeting?.waitingRoom !== true) fail('zoom_waiting_room_disabled', 409);
      }
      if (!await ctx.stillOwned()) fail('zoom_busy', 503);
      // Una cancelación/reprogramación que llegó durante el efecto se corrige con la verdad interna vigente.
      await db.transaction(async transaction => {
        session = await M.ClassSession.findByPk(sessionId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!session) return;
        const changed = before !== `${session.version}:${session.status}:${session.startsAt?.getTime()}`;
        const currentConnection = await connection.rowFor(session.teacherId);
        // Refresh o reconexión de la misma cuenta no invalida el efecto ya aplicado.
        const connected = currentConnection?.status === 'connected'
          && (await connection.readTokens(currentConnection)).accountId === tokens.accountId;
        await ref.update({ connectionId: row.id, externalId: meeting?.id || ref.externalId, joinUrl: terminal.includes(session.status) ? null : meeting ? participantUrl(meeting.joinUrl) : null,
          syncedVersion: changed ? ref.syncedVersion : session.version, status: changed ? 'pending' : !connected ? 'needs_attention' : terminal.includes(session.status) ? 'cancelled' : 'ready',
          lastError: connected ? null : 'integration_not_connected', attempts: ref.attempts + 1 }, { transaction });
        if (changed) await enqueue(session, transaction, 'reconcile');
        else if (!connected && currentConnection?.status === 'connected') await enqueue(session, transaction, 'account_changed');
        // Calendar recibe únicamente la ref de participante. No depende de que el evento ya exista.
        if (!changed && connected && session.status === 'confirmed' && features.isEnabled('google_calendar')
          && await M.ExternalConnection.count({ where: { userId: session.teacherId, provider: 'google_calendar', status: 'connected' }, transaction })) {
          await outbox.enqueue({ topic: 'calendar.sync', aggregateType: 'class_sessions', aggregateId: session.id,
            aggregateVersion: session.version, dedupeKey: `calendar:zoom:${ref.id}:v${session.version}:${adapter.hash(ref.joinUrl || '').slice(0, 12)}` }, { transaction });
        }
      });
    } catch (error) {
      const code = safeError(error);
      if (ref) await ref.update({ status: 'needs_attention', lastError: code, attempts: ref.attempts + 1 });
      // El outbox nunca recibe mensajes/cuerpos/tokens/URLs devueltos por proveedores.
      fail(code, error.statusCode || 503);
    }
  });
}
async function join(user, sessionId) {
  const { session, seat, isOwner } = await visible(user, sessionId);
  if (session.status !== 'confirmed' || (!isOwner && seat.status === 'cancelled')) fail('proposal_stale');
  const ref = await M.ExternalSyncRef.findOne({ where: { sessionId: session.id, provider: 'zoom' } });
  if (ref?.manualJoinUrl) return { joinUrl: participantUrl(ref.manualJoinUrl), manual: true };
  if (!ref?.externalId && isOwner) fail('provider_unavailable', 503);
  if (ref?.status !== 'ready') fail('integration_not_connected');
  if (!isOwner) return { joinUrl: participantUrl(ref.joinUrl, !ref.externalId), manual: false };
  const { tokens } = await connection.credentials(session.teacherId);
  let hostUrl;
  try { hostUrl = (await connection.withCredentials(session.teacherId, tokens, currentTokens => adapter.host(currentTokens, ref.externalId))).value; }
  catch (error) { fail(safeError(error), error.statusCode || 503); }
  const current = await M.ClassSession.findByPk(session.id);
  const grant = await connection.rowFor(session.teacherId);
  if (current?.status !== 'confirmed' || current.version !== session.version || grant?.status !== 'connected') fail('proposal_stale');
  // Jamás persistir start_url; el adaptador solo lo obtiene en esta acción autorizada.
  return { hostUrl, manual: false };
}
async function retry(user, sessionId) {
  const { session } = await visible(user, sessionId, { owner: true, support: true });
  await connection.credentials(session.teacherId);
  await db.transaction(async transaction => {
    await enqueue(session, transaction);
    await M.AuditLog.create({ actorId: user.id, action: 'zoom.sync_retry', entityType: 'class_sessions', entityId: session.id,
      data: { version: session.version } }, { transaction });
  });
  return { queued: true };
}
async function manual(user, sessionId, body = {}) {
  const { session } = await visible(user, sessionId, { owner: true });
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('validation_failed', 400);
  if (Object.keys(body).some(k => !['version', 'joinUrl'].includes(k))) fail('validation_failed', 400);
  const link = body.joinUrl === null ? null : participantUrl(body.joinUrl);
  await db.transaction(async transaction => {
    const current = await M.ClassSession.findByPk(session.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (body.version !== current.version) fail('version_conflict');
    if (current.status !== 'confirmed') fail('proposal_stale');
    const [ref] = await M.ExternalSyncRef.findOrCreate({ where: { sessionId: session.id, provider: 'zoom' },
      defaults: { correlationKey: `zoom:session:${session.id}` }, transaction });
    await ref.update({ manualJoinUrl: link, manualJoinUrlById: link ? user.id : null }, { transaction });
    if (features.isEnabled('google_calendar') && await M.ExternalConnection.count({ where: { userId: session.teacherId, provider: 'google_calendar', status: 'connected' }, transaction })) {
      await outbox.enqueue({ topic: 'calendar.sync', aggregateType: 'class_sessions', aggregateId: current.id,
        aggregateVersion: current.version, dedupeKey: `calendar:zoom-manual:${current.id}:v${current.version}:${crypto.randomUUID()}` }, { transaction });
    }
    await M.AuditLog.create({ actorId: user.id, action: 'zoom.manual_link', entityType: 'class_sessions', entityId: session.id,
      data: { version: current.version, enabled: Boolean(link) } }, { transaction });
  });
  return { manual: Boolean(link) };
}
async function sessions(user) {
  await connection.teacher(user);
  const items = await M.ClassSession.findAll({ where: { teacherId: user.id, status: 'confirmed' }, order: [['startsAt', 'ASC']], limit: 200 });
  const refs = await M.ExternalSyncRef.findAll({ where: { sessionId: items.map(s => s.id), provider: 'zoom' } });
  return { items: items.map(s => {
    const ref = refs.find(r => r.sessionId === s.id);
    return { id: s.id, version: s.version, startsAt: s.startsAt, minutes: s.minutes, status: ref?.status || 'needs_attention',
      manual: Boolean(ref?.manualJoinUrl), lastError: ref?.lastError || null, upcomingWithoutMeeting: s.startsAt < new Date(Date.now() + 24 * 3600000)
        && !ref?.manualJoinUrl && ref?.status !== 'ready' };
  }) };
}
async function sessionStatus(user, sessionId) {
  const { session } = await visible(user, sessionId);
  const ref = await M.ExternalSyncRef.findOne({ where: { sessionId: session.id, provider: 'zoom' } });
  return { fake: adapter.isFake(), status: ref?.status || 'needs_attention', manual: Boolean(ref?.manualJoinUrl), lastError: ref?.lastError || null };
}
outbox.register('zoom.sync', sync);
module.exports = { participantUrl, visible, exclusive, assertCapacity, sync, join, retry, manual, sessions, sessionStatus };
