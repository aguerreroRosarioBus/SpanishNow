const { User } = require('../models');
const sequelize = require('../config/database');

class PreferenceError extends Error {
  constructor(code, message, params = {}) {
    super(message);
    this.code = code;
    this.params = params;
    this.statusCode = 400;
  }
}

const serializePreferences = user => ({
  locale: user.locale ?? null,
  timeZone: user.timeZone ?? null,
  timeZoneConfirmedAt: user.timeZoneConfirmedAt ?? null
});

/** Valida identificadores IANA y sus aliases, nunca abreviaturas ni offsets sueltos. No convierte horarios. */
function isTimeZone(value) {
  if (typeof value !== 'string' || value.length > 64 || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch { return false; }
}

function validatePatch(body) {
  const allowed = ['locale', 'timeZone', 'confirmTimeZone'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    throw new PreferenceError('validation_failed', 'Se requiere al menos una preferencia.', { fields: allowed });
  }
  const fields = Object.keys(body).filter(key => !allowed.includes(key));
  if (Object.hasOwn(body, 'locale') && !['en', 'es'].includes(body.locale)) fields.push('locale');
  if (Object.hasOwn(body, 'confirmTimeZone') && typeof body.confirmTimeZone !== 'boolean') fields.push('confirmTimeZone');
  if (fields.length) throw new PreferenceError('validation_failed', 'Revisa las preferencias indicadas.', { fields });
  if (Object.hasOwn(body, 'timeZone') && !isTimeZone(body.timeZone)) {
    throw new PreferenceError('time_zone_invalid', 'Elige una zona horaria IANA válida.', { fields: ['timeZone'] });
  }
  return body;
}

async function updatePreferences(userId, body) {
  const patch = validatePatch(body);
  return sequelize.transaction(async transaction => {
    // Leer de nuevo bajo lock: req.user puede ser anterior a otra actualización de idioma/zona.
    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) { const error = new PreferenceError('not_found', 'El usuario no está disponible.'); error.statusCode = 404; throw error; }
    const changes = {};
    if (Object.hasOwn(patch, 'locale')) changes.locale = patch.locale;
    const zone = Object.hasOwn(patch, 'timeZone') ? patch.timeZone : user.timeZone;
    const changedZone = zone !== user.timeZone;
    if (Object.hasOwn(patch, 'timeZone')) changes.timeZone = zone;
    if (changedZone) changes.timeZoneConfirmedAt = null;
    if (patch.confirmTimeZone) {
      if (!zone) throw new PreferenceError('time_zone_invalid', 'Primero elige una zona horaria.');
      // Reintentar la misma confirmación no altera su fecha histórica.
      if (changedZone || !user.timeZoneConfirmedAt) changes.timeZoneConfirmedAt = new Date();
    }
    await user.update(changes, { transaction, fields: Object.keys(changes) });
    // Responder con la precisión realmente persistida por las columnas de W00.
    await user.reload({ transaction });
    return serializePreferences(user);
  });
}

module.exports = { serializePreferences, updatePreferences, isTimeZone, validatePatch };
