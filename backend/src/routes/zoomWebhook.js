// Raw body requerido: esta ruta se monta ANTES de express.json().
const router = require('express').Router();
const crypto = require('node:crypto');
const db = require('../config/database');
const M = require('../models');
const zoomConnections = require('../services/zoomConnection');
const { fail, hash } = require('../services/zoomAdapter');
const outbox = require('../services/outbox');
const { Op } = require('sequelize');
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Zoom no siempre envía event_id. Canonizar el JSON evita que su orden cambie la identidad.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
router.post('/', require('express').raw({ type: 'application/json', limit: '256kb' }), async (req, res, next) => {
  try {
    require('../services/zoomAdapter').assertConfigured();
    const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    const timestamp = req.get('x-zm-request-timestamp');
    const signature = req.get('x-zm-signature');
    if (!secret || !Buffer.isBuffer(req.body) || !/^\d{10}$/.test(timestamp || '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) fail('zoom_webhook_invalid', 401);
    const expected = `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:`).update(req.body).digest('hex')}`;
    if (!/^v0=[a-f0-9]{64}$/.test(signature || '') || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail('zoom_webhook_invalid', 401);
    let body; try { body = JSON.parse(req.body.toString()); } catch { fail('validation_failed', 400); }
    if (body.event === 'endpoint.url_validation') {
      const plainToken = body.payload?.plainToken;
      if (typeof plainToken !== 'string' || plainToken.length > 512) fail('validation_failed', 400);
      return res.json({ plainToken, encryptedToken: crypto.createHmac('sha256', secret).update(plainToken).digest('hex') });
    }
    const accountId = body.payload?.account_id || body.account_id || null;
    const zoomUserId = body.payload?.user_id || body.payload?.object?.host_id || null;
    // Solo el grant que emitió el evento puede afectar sus refs; no se confía en un meeting id aislado.
    const connections = await M.ExternalConnection.findAll({ where: { provider: 'zoom', status: 'connected' } });
    let connection;
    for (const c of connections) {
      try {
        const tokens = await zoomConnections.readTokens(c);
        const accountMatches = accountId ? String(tokens.accountId) === String(accountId) : Boolean(zoomUserId);
        const userMatches = zoomUserId ? String(tokens.userId) === String(zoomUserId) : true;
        if (accountMatches && userMatches) { connection = c; break; }
      }
      catch (error) { if (error.code !== 'zoom_authorization_lost') throw error; }
    }
    if (!connection) return res.json({ received: true });
    const meetingId = body.payload?.object?.id;
    const eventKey = hash(JSON.stringify([connection.id, body.event_id || canonical(body)]));
    // Limpieza autocommit: no mantener gap locks temporales mientras se insertan recibos concurrentes.
    await M.ZoomWebhookReceipt.destroy({ where: { receivedAt: { [Op.lt]: new Date(Date.now() - RECEIPT_TTL_MS) } }, limit: 100 });
    await db.transaction(async transaction => {
      const current = await M.ExternalConnection.findByPk(connection.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!current) return;
      // La fila de conexión serializa dos copias concurrentes; PK único como defensa en persistencia.
      // Recibo y efectos se confirman juntos: un fallo permite que el siguiente intento procese el evento.
      if (await M.ZoomWebhookReceipt.findByPk(eventKey, { transaction })) return;
      await M.ZoomWebhookReceipt.create({ eventKey, receivedAt: new Date(Date.now()) }, { transaction });
      const data = { eventKey, event: ['meeting.deleted', 'meeting.updated', 'app_deauthorized'].includes(body.event) ? body.event : 'other' };
      await M.AuditLog.create({ action: 'zoom.webhook', entityType: 'external_connections', entityId: current.id, data }, { transaction });
      if (body.event === 'app_deauthorized') {
        await current.update({ status: 'needs_attention', credentials: null, capabilities: null, refreshLockedUntil: null,
          lastError: 'zoom_revoked', version: current.version + 1 }, { transaction });
        await M.ExternalSyncRef.update({ status: 'needs_attention', lastError: 'zoom_revoked' }, { where: { connectionId: current.id, provider: 'zoom', status: { [require('sequelize').Op.ne]: 'cancelled' } }, transaction });
      }
      if (body.event === 'meeting.deleted') await M.ExternalSyncRef.update({ status: 'needs_attention', lastError: 'zoom_meeting_missing' },
        { where: { connectionId: current.id, provider: 'zoom', externalId: String(meetingId), status: { [require('sequelize').Op.ne]: 'cancelled' } }, transaction });
      if (body.event === 'meeting.updated' && meetingId) {
        const eventObject = body.payload?.object || {};
        const hasStart = Object.prototype.hasOwnProperty.call(eventObject, 'start_time');
        const hasDuration = Object.prototype.hasOwnProperty.call(eventObject, 'duration');
        const eventStart = Date.parse(eventObject.start_time);
        const eventDuration = Number(eventObject.duration);
        const refs = await M.ExternalSyncRef.findAll({ where: { connectionId: current.id, provider: 'zoom', externalId: String(meetingId),
          status: { [require('sequelize').Op.ne]: 'cancelled' } }, transaction });
        for (const ref of refs) {
          const session = await M.ClassSession.findByPk(ref.sessionId, { transaction });
          if (!session || session.status !== 'confirmed') continue;
          // Zoom puede omitir campos en el evento. Solo un campo presente y distinto del estado
          // interno justifica otra sincronización; los eventos parciales no deben crear un bucle.
          const startDiffers = hasStart && eventStart !== new Date(session.startsAt).getTime();
          const durationDiffers = hasDuration && eventDuration !== Number(session.minutes);
          if (!startDiffers && !durationDiffers) continue;
          await ref.update({ status: 'pending', lastError: null }, { transaction });
          await outbox.enqueue({ topic: 'zoom.sync', aggregateType: 'class_sessions', aggregateId: session.id,
            aggregateVersion: session.version, dedupeKey: `zoom:webhook:${eventKey}:${ref.id}` }, { transaction });
        }
      }
      // Ningún evento externo marca asistencia, completa clases ni consume saldo.
    });
    res.json({ received: true });
  } catch (error) { next(error); }
});
module.exports = router;
