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
const courseFields = { active:'activeDigest', pending:'pendingDigest', verified:'verifiedAt' };
const packageFields = { active:'classActiveDigest', pending:'classPendingDigest', verified:'classVerifiedAt' };
const fieldsFor = classPackages => classPackages ? packageFields : courseFields;

const read = teacherId => TeacherHotmartConnection.findByPk(teacherId);

function present(connection, req, { classPackages = false } = {}) {
  const fields = fieldsFor(classPackages);
  const url = connection && (connection[fields.active] || connection[fields.pending])
    ? `${hotmart.webhookUrl(req, { trustedProtocol: true })}/teachers/${connection.publicId}` : null;
  return {
    verifiedAt: connection?.[fields.verified] ?? null,
    pending: Boolean(connection?.[fields.pending]),
    webhookUrl: url && classPackages ? `${url}/class-packages` : url
  };
}

async function stage(teacherId, token, { classPackages = false } = {}) {
  const fields = fieldsFor(classPackages);
  const [connection] = await TeacherHotmartConnection.findOrCreate({
    where: { teacherId }, defaults: { publicId: randomUUID() }
  });
  // Volver a pegar la misma clave permite repetir la prueba. La clave activa sigue aceptando pagos.
  await connection.update({ [fields.pending]: digest(connection.publicId, token) });
  return connection;
}

async function receive(publicId, headerToken, body, { classPackages = false } = {}) {
  const fields = fieldsFor(classPackages);
  if (!publicIdPattern.test(publicId)) return { status: 404 };
  const connection = await TeacherHotmartConnection.findOne({ where: { publicId } });
  if (!connection) return { status: 404 };

  const token = headerToken || body?.hottok;
  if (typeof token !== 'string' || !tokenPattern.test(token)) return { status: 401 };
  const incoming = digest(publicId, token);
  const active = matches(incoming, connection[fields.active]);
  const pending = matches(incoming, connection[fields.pending]);
  if (!active && !pending) return { status: 401 };

  // El evento de prueba entra por la misma dirección que los avisos de compra.
  // Solo registramos la fecha y nunca guardamos el contenido del carrito.
  if (body?.event === testEvent) {
    if (pending) {
      await TeacherHotmartConnection.update({ [fields.active]: incoming, [fields.pending]: null, [fields.verified]: new Date() },
        { where: { teacherId: connection.teacherId, [fields.pending]: incoming } });
    }
    return { test: true };
  }

  if (!active) return { status: 503 };
  if (classPackages) {
    return require('./classPayments').handleEvent(body, { connectionId: publicId, teacherId: connection.teacherId });
  }
  return hotmart.handleCourseEvent(body, connection.teacherId);
}

module.exports = { read, present, stage, receive, tokenPattern };
