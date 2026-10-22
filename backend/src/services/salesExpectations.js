const { createHash } = require('crypto');
const sequelize = require('../config/database');
const { Course } = require('../models');
const CourseExpectations = require('../models/CourseExpectations');
const legal = require('./legalDocuments');
const FIELDS = ['audience', 'prerequisites', 'objective', 'contents', 'selfStudy', 'outcomes', 'supportIncluded', 'supportExcluded'];

// Contrato compartido con W05: texto plano EN/ES; jamás se guarda HTML ni se sustituye la duración de sesión.
function validateExpectations(value, { complete = true } = {}) {
  if (!legal.only(value, ['en', 'es'])) throw legal.invalid(['expectations']);
  for (const locale of ['en', 'es']) {
    if (!legal.only(value[locale], FIELDS) || FIELDS.some(key => typeof value[locale][key] !== 'string' || value[locale][key].length > 4000 || (complete && !value[locale][key].trim()))) throw legal.invalid([`expectations.${locale}`]);
  }
  return Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(FIELDS.map(k => [k, value[l][k].trim()]))]));
}
async function read(courseId, { transaction } = {}) {
  const row = await CourseExpectations.findByPk(courseId, { transaction });
  return row ? { version: row.version, expectations: row.expectations } : { version: 0, expectations: null };
}
async function save(user, courseId, body) {
  if (!legal.validId(courseId)) throw legal.fail(404, 'not_found');
  if (!legal.only(body, ['version', 'expectations']) || !Number.isSafeInteger(body.version) || body.version < 0) throw legal.invalid(['version']);
  const expectations = validateExpectations(body.expectations);
  return sequelize.transaction(async transaction => {
    const course = await Course.findOne({ where: { id: courseId, teacherId: user.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!course || user.role !== 'teacher') throw legal.fail(404, 'not_found');
    const row = await CourseExpectations.findByPk(courseId, { transaction, lock: transaction.LOCK.UPDATE });
    if ((row?.version || 0) !== body.version) throw legal.fail(409, 'version_conflict');
    const values = { expectations, version: body.version + 1, updatedById: user.id };
    if (row) await row.update(values, { transaction });
    else await CourseExpectations.create({ courseId: course.id, ...values }, { transaction });
    return { version: values.version, expectations };
  });
}
async function commercialView(course, options = {}) {
  const configured = await read(course.id, options);
  const docs = await legal.currentSet(['terms', 'privacy', 'refunds'], options);
  const snapshot = {
    courseId: course.id, title: course.title, teacherId: course.teacherId,
    price: course.price, currency: course.currency, ...configured,
    legalDocuments: docs.map(d => ({ documentKey: d.documentKey, version: String(d.version), content: d.content, business: d.business, effectiveAt: d.effectiveAt.toISOString() }))
  };
  return { ...snapshot, hash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}
module.exports = { FIELDS, validateExpectations, read, save, commercialView };
