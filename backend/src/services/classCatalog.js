const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { User, Course, TeacherClassSettings, ClassPackageTemplate: Template, ClassPackageTemplateVersion: Version, ClassPolicyVersion: Policy, AuditLog } = require('../models');
const { hasPermission } = require('../config/permissions');
const { validatePolicy } = require('../domain/classPolicy');
const initial = require('../domain/classInitialCatalog');
const { validateExpectations } = require('./salesExpectations');
const { fail, invalid, only, validId } = require('./legalDocuments');
const FIELDS = ['nameEn', 'nameEs', 'descriptionEn', 'descriptionEs', 'modality', 'groupSize', 'billing', 'sessionsCount', 'minutesPerSession', 'seatsCovered', 'priceAmount', 'currency', 'validityHours', 'policyVersionId', 'hotmartProductId', 'hotmartOfferCode', 'hotmartCheckoutUrl', 'expectations'];
const ID = /^[A-Za-z0-9-]{1,40}$/;
const positive = (n, max = 2147483647) => Number.isInteger(n) && n > 0 && n <= max;
const canManageAll = user => hasPermission(user, 'class_packages.manage_all');

function ownerId(user, requested) {
  if (requested !== undefined && (!validId(requested) || (!canManageAll(user) && Number(requested) !== user.id))) throw fail(404, 'not_found');
  const id = requested === undefined ? user.id : Number(requested);
  if (id === user.id && user.role !== 'teacher') throw fail(403, 'forbidden');
  return id;
}
async function teacherLock(id, transaction) {
  const teacher = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!teacher || teacher.role !== 'teacher' || teacher.suspendedAt) throw fail(404, 'not_found');
  return teacher;
}
async function owned(user, id, options = {}) {
  if (!validId(id)) throw fail(404, 'not_found');
  const row = await Template.findByPk(id, options);
  if (!row || !(user.role === 'teacher' && row.teacherId === user.id) && !canManageAll(user)) throw fail(404, 'not_found');
  return row;
}
async function policy(body, transaction, actorId) {
  const row = body.policyVersionId === undefined ? await Policy.findOne({ order: [['version', 'DESC']], transaction }) : await Policy.findByPk(body.policyVersionId, { transaction });
  if (!row) throw invalid(['policyVersionId']);
  return require('./classRefundPolicy').current(actorId, transaction, row);
}
function validateVersion(body) {
  for (const key of ['nameEn', 'nameEs']) if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 150) throw invalid([key]);
  for (const key of ['descriptionEn', 'descriptionEs']) if (body[key] != null && (typeof body[key] !== 'string' || body[key].length > 8000)) throw invalid([key]);
  for (const key of ['sessionsCount', 'minutesPerSession']) if (!positive(body[key], 65535)) throw invalid([key]);
  for (const key of ['priceAmount', 'validityHours']) if (!positive(body[key])) throw invalid([key]);
  // D07: no modalidades de cobro ni capacidad implícitas.
  const valid = body.modality === 'individual' && body.groupSize === 1 && body.billing === 'per_buyer' && body.seatsCovered === 1 ||
    body.modality === 'group' && body.groupSize === 2 && body.billing === 'per_group' && body.seatsCovered === 2 ||
    body.modality === 'group' && body.groupSize === 3 && body.billing === 'per_seat' && body.seatsCovered === 1;
  if (!valid) throw invalid(['modality', 'groupSize', 'billing', 'seatsCovered']);
  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) throw invalid(['currency']);
  try { if (!Intl.supportedValuesOf('currency').includes(body.currency)) throw new Error(); } catch { throw invalid(['currency']); }
  if (body.policyVersionId !== undefined && !validId(body.policyVersionId)) throw invalid(['policyVersionId']);
  const values = Object.fromEntries(FIELDS.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
  if (body.expectations != null) values.expectations = validateExpectations(body.expectations, { complete: false });
  for (const k of ['hotmartProductId', 'hotmartOfferCode']) {
    values[k] = body[k] || null;
    if (values[k] !== null && (typeof values[k] !== 'string' || !ID.test(values[k]))) throw invalid([k]);
  }
  values.hotmartCheckoutUrl = body.hotmartCheckoutUrl || null;
  if (values.hotmartCheckoutUrl) {
    let url; try { url = new URL(values.hotmartCheckoutUrl); } catch { throw invalid(['hotmartCheckoutUrl']); }
    if (typeof values.hotmartCheckoutUrl !== 'string' || values.hotmartCheckoutUrl.length > 500 || url.protocol !== 'https:' || url.hostname !== 'pay.hotmart.com' || url.username || url.password || url.port || url.hash) throw invalid(['hotmartCheckoutUrl']);
  }
  return values;
}
function assertReady(version) {
  if (!version.hotmartProductId || !version.hotmartOfferCode || !version.hotmartCheckoutUrl) throw fail(409, 'hotmart_mapping_missing');
  validateExpectations(version.expectations);
}
async function assertProductFree(productId, { transaction } = {}) {
  if (!productId) return;
  await require('./hotmartProductLocks').lock(productId, transaction);
  if (await Course.findOne({ where: { hotmartProductId: productId }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE })) throw fail(409, 'hotmart_product_conflict');
}
async function present(row, { versions = false, publicView = false, transaction } = {}) {
  const current = await Version.findByPk(row.currentVersionId, { transaction });
  const currentPolicy = current && await Policy.findByPk(current.policyVersionId, { transaction });
  const visible = v => {
    if (!v) return null;
    const { createdById, hotmartProductId, hotmartOfferCode, hotmartCheckoutUrl, ...rest } = v.toJSON();
    return publicView ? rest : v.toJSON();
  };
  // Plantilla sin versión vigente (current null: creada fuera de la API sin `currentVersionId`, o con la versión borrada a mano):
  // si quedó alguna versión guardada se devuelve la última para precargar «completar datos».
  const orphan = current ? null : await Version.findOne({ where: { templateId: row.id }, order: [['version', 'DESC']], transaction });
  return { id: row.id, teacherId: row.teacherId, templateKey: row.templateKey, status: row.status, current: visible(current), policy: currentPolicy ? { version: currentPolicy.version, rules: currentPolicy.rules } : null,
    ...(orphan ? { lastVersion: visible(orphan) } : {}),
    ...(versions ? { versions: (await Version.findAll({ where: { templateId: row.id }, order: [['version', 'DESC']], transaction })).map(visible) } : {}) };
}
async function list(user, requested) {
  const teacherId = ownerId(user, requested);
  return Promise.all((await Template.findAll({ where: { teacherId }, order: [['id', 'ASC']] })).map(row => present(row)));
}
async function detail(user, id) { return present(await owned(user, id), { versions: true }); }
async function create(user, body, requested) {
  if (!only(body, ['templateKey', ...FIELDS]) || typeof body.templateKey !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.templateKey)) throw invalid(['templateKey']);
  const values = validateVersion(body); const teacherId = ownerId(user, requested);
  return sequelize.transaction(async transaction => {
    await teacherLock(teacherId, transaction);
    if (await Template.findOne({ where: { teacherId, templateKey: body.templateKey }, transaction })) throw fail(409, 'template_key_conflict');
    const rules = await policy(body, transaction, user.id); await assertProductFree(values.hotmartProductId, { transaction });
    const row = await Template.create({ teacherId, templateKey: body.templateKey, status: 'draft' }, { transaction });
    const v = await Version.create({ ...values, templateId: row.id, version: 1, policyVersionId: rules.id, createdById: user.id }, { transaction });
    await row.update({ currentVersionId: v.id }, { transaction });
    return present(row, { transaction });
  });
}
async function newVersion(user, id, body) {
  // `version: 0` es la única forma de completar una plantilla que quedó sin versión vigente (ver `present`).
  if (!only(body, ['version', ...FIELDS]) || !(positive(body.version) || body.version === 0)) throw invalid(['version']);
  const values = validateVersion(body);
  return sequelize.transaction(async transaction => {
    const row = await owned(user, id, { transaction, lock: transaction.LOCK.UPDATE });
    const previous = row.currentVersionId ? await Version.findByPk(row.currentVersionId, { transaction }) : null;
    if ((previous ? previous.version : 0) !== body.version) throw fail(409, 'version_conflict');
    if (row.status === 'archived') throw fail(409, 'version_conflict');
    const rules = await policy(body, transaction, user.id); await assertProductFree(values.hotmartProductId, { transaction });
    if (row.status === 'active') assertReady(values);
    // Sin versión vigente se continúa tras la última existente (si la hubiera) para no chocar con el índice (templateId, version).
    const last = previous ? previous.version : (await Version.max('version', { where: { templateId: row.id }, transaction })) || 0;
    const v = await Version.create({ ...values, templateId: row.id, version: last + 1, policyVersionId: rules.id, createdById: user.id }, { transaction });
    await row.update({ currentVersionId: v.id }, { transaction });
    return present(row, { transaction });
  });
}
async function setStatus(user, id, body) {
  if (!only(body, ['status', 'version']) || !['active', 'paused', 'archived'].includes(body.status) || !positive(body.version)) throw invalid(['status', 'version']);
  return sequelize.transaction(async transaction => {
    const row = await owned(user, id, { transaction, lock: transaction.LOCK.UPDATE });
    const current = row.currentVersionId ? await Version.findByPk(row.currentVersionId, { transaction }) : null;
    if (!current) throw fail(409, 'template_without_version');
    if (current.version !== body.version) throw fail(409, 'version_conflict');
    if (row.status === 'archived' && body.status !== 'archived') throw fail(409, 'version_conflict');
    if (body.status === 'active') assertReady(current);
    await row.update({ status: body.status }, { transaction });
    return present(row, { transaction });
  });
}
async function importInitial(user, requested) {
  const teacherId = ownerId(user, requested);
  return sequelize.transaction(async transaction => {
    await teacherLock(teacherId, transaction);
    const rules = await require('./classRefundPolicy').current(user.id, transaction);
    await TeacherClassSettings.findOrCreate({ where: { userId: teacherId }, defaults: { salesPausedAt: new Date() }, transaction });
    for (const item of initial) {
      const { templateKey, ...values } = item;
      const existing = await Template.findOne({ where: { teacherId, templateKey }, transaction });
      if (existing) {
        // Una plantilla sin versión vigente (la FK currentVersionId es ON DELETE SET NULL: alguien borró la versión a mano)
        // se repara con la versión inicial; si ya tiene versión vigente no se toca.
        if (existing.currentVersionId && await Version.findByPk(existing.currentVersionId, { transaction })) continue;
        const last = (await Version.max('version', { where: { templateId: existing.id }, transaction })) || 0;
        const v = await Version.create({ ...values, policyVersionId: rules.id, templateId: existing.id, version: last + 1, createdById: user.id }, { transaction });
        await existing.update({ currentVersionId: v.id }, { transaction });
        continue;
      }
      const row = await Template.create({ teacherId, templateKey, status: 'draft' }, { transaction });
      const v = await Version.create({ ...values, policyVersionId: rules.id, templateId: row.id, version: 1, createdById: user.id }, { transaction });
      await row.update({ currentVersionId: v.id }, { transaction });
    }
    return Promise.all((await Template.findAll({ where: { teacherId }, order: [['id', 'ASC']], transaction })).map(row => present(row, { transaction })));
  });
}
async function publicCatalog(id) {
  if (!validId(id)) throw fail(404, 'not_found');
  const teacher = await User.findByPk(id, { attributes: ['id', 'name', 'role', 'suspendedAt'] });
  const settings = await TeacherClassSettings.findByPk(id);
  if (!teacher || teacher.role !== 'teacher' || teacher.suspendedAt || !settings?.classesEnabledAt) throw fail(404, 'not_found');
  const salesPaused = Boolean(settings.salesPausedAt);
  const rows = salesPaused ? [] : await Template.findAll({ where: { teacherId: id, status: 'active' }, order: [['id', 'ASC']] });
  return { teacher: { id: teacher.id, name: teacher.name }, salesPaused, items: await Promise.all(rows.map(row => present(row, { publicView: true }))) };
}
async function settings(user) {
  if (user.role !== 'teacher') throw fail(403, 'forbidden');
  const [row] = await TeacherClassSettings.findOrCreate({ where: { userId: user.id }, defaults: { salesPausedAt: new Date() } });
  return row;
}
async function saveSettings(user, body) {
  if (!only(body, ['salesPaused', 'acceptsInquiries', 'sessionBufferMinutes', 'minLeadTimeHours'])) throw invalid();
  if (body.salesPaused === false) await require('./classPackageProvider').assertSelling();
  const values = {};
  for (const key of ['salesPaused', 'acceptsInquiries']) if (body[key] !== undefined && typeof body[key] !== 'boolean') throw invalid([key]);
  if (body.salesPaused !== undefined) values.salesPausedAt = body.salesPaused ? new Date() : null;
  if (body.acceptsInquiries !== undefined) values.acceptsInquiries = body.acceptsInquiries;
  for (const key of ['sessionBufferMinutes', 'minLeadTimeHours']) if (body[key] !== undefined) {
    if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > 65535) throw invalid([key]);
    values[key] = body[key];
  }
  const row = await settings(user);
  return sequelize.transaction(async transaction => {
    const locked = await TeacherClassSettings.findByPk(row.userId, { transaction, lock: transaction.LOCK.UPDATE });
    await locked.update(values, { transaction }); return locked;
  });
}
async function enableTeacher(actor, id, body) {
  if (!validId(id) || !only(body, ['enabled']) || typeof body.enabled !== 'boolean') throw invalid(['enabled']);
  return sequelize.transaction(async transaction => {
    await teacherLock(id, transaction);
    const [row] = await TeacherClassSettings.findOrCreate({ where: { userId: id }, defaults: { salesPausedAt: new Date() }, transaction });
    await row.update({ classesEnabledAt: body.enabled ? row.classesEnabledAt || new Date() : null }, { transaction });
    await AuditLog.create({ actorId: actor.id, action: 'class_teacher.enabled', entityType: 'users', entityId: Number(id), data: { enabled: body.enabled } }, { transaction });
    return row;
  });
}
async function createPolicy(actor, body) {
  if (!only(body, ['version', 'rules']) || !positive(body.version)) throw invalid(['version']);
  const errors = validatePolicy(body.rules); if (errors.length) throw invalid(errors);
  if (body.rules.refundMode !== 'full_unused_then_review' || body.rules.refundWindowHours < 360) throw invalid(['refundMode', 'refundWindowHours']);
  return sequelize.transaction(async transaction => {
    // El mismo mutex de política que usa la importación serializa nuevas versiones.
    await Policy.findOne({ order: [['version', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    const latest = await Policy.findOne({ order: [['version', 'DESC']], transaction });
    if (body.version !== (latest?.version || 0) + 1) throw fail(409, 'version_conflict');
    return Policy.create({ version: body.version, rules: body.rules, createdById: actor.id }, { transaction });
  });
}
module.exports = { FIELDS, owned, assertReady, assertProductFree, present, list, detail, create, newVersion, setStatus, importInitial, publicCatalog, settings, saveSettings, enableTeacher, createPolicy };
