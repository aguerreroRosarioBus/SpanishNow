const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const { TeacherHotmartConnection } = require('../models');
const hotmart = require('./hotmartService');

// Hotmart envía una clave de productor. Solo necesitamos comparar, nunca recuperarla.
const digest = (publicId, token) => createHash('sha256').update(publicId).update(token).digest('hex');
const matches = (incoming, stored) => Boolean(stored) &&
  timingSafeEqual(Buffer.from(incoming, 'hex'), Buffer.from(stored, 'hex'));
const tokenPattern = /^[\x21-\x7e]{16,512}$/;
const publicIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const testEvent = 'PURCHASE_OUT_OF_SHOPPING_CART';

const read = teacherId => TeacherHotmartConnection.findByPk(teacherId);

function present(connection, req) {
  return {
    verifiedAt: connection?.verifiedAt ?? null,
    pending: Boolean(connection?.pendingDigest),
    webhookUrl: connection ? `${hotmart.webhookUrl(req, { trustedProtocol: true })}/teachers/${connection.publicId}` : null
  };
}

async function stage(teacherId, token) {
  const [connection] = await TeacherHotmartConnection.findOrCreate({
    where: { teacherId }, defaults: { publicId: randomUUID() }
  });
  // Volver a pegar la misma clave permite repetir la prueba. La clave activa sigue aceptando pagos.
  await connection.update({ pendingDigest: digest(connection.publicId, token) });
  return connection;
}

async function receive(publicId, headerToken, body) {
  if (!publicIdPattern.test(publicId)) return { status: 404 };
  const connection = await TeacherHotmartConnection.findOne({ where: { publicId } });
  if (!connection) return { status: 404 };

  const token = headerToken || body?.hottok;
  if (typeof token !== 'string' || !tokenPattern.test(token)) return { status: 401 };
  const incoming = digest(publicId, token);
  const active = matches(incoming, connection.activeDigest);
  const pending = matches(incoming, connection.pendingDigest);
  if (!active && !pending) return { status: 401 };

  // El evento de prueba entra por la misma dirección que los avisos de compra.
  // Solo registramos la fecha y nunca guardamos el contenido del carrito.
  if (body?.event === testEvent) {
    if (pending) {
      await TeacherHotmartConnection.update({ activeDigest: incoming, pendingDigest: null, verifiedAt: new Date() },
        { where: { teacherId: connection.teacherId, pendingDigest: incoming } });
    }
    return { test: true };
  }

  if (!active) return { status: 503 };
  return hotmart.handleCourseEvent(body, connection.teacherId);
}

module.exports = { read, present, stage, receive, tokenPattern };
