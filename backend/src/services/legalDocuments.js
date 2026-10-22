const { Op } = require('sequelize');
const sequelize = require('../config/database');
const LegalDocument = require('../models/LegalDocument');
const LegalDocumentHead = require('../models/LegalDocumentHead');
const { LegalAcceptance, User, AuditLog, ClassOffer } = require('../models');
const CourseCheckoutSnapshot = require('../models/CourseCheckoutSnapshot');
const KEYS = ['terms', 'privacy', 'refunds', 'package_terms'];
const LOCALES = ['en', 'es'];
const invalid = (fields = []) => fail(400, 'validation_failed', { fields });
function fail(statusCode, code, params = {}) { return Object.assign(new Error(code), { statusCode, code, params }); }
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => plain(value) && Object.keys(value).every(k => keys.includes(k));
const text = (v, max) => typeof v === 'string' && v.length <= max;
const validId = v => /^[1-9]\d{0,9}$/.test(String(v)) && Number(v) <= 2147483647;
const versionOf = doc => String(doc.version);

function validateDraft(body) {
  if (!only(body, ['documentKey', 'content', 'business', 'effectiveAt'])) throw invalid();
  if (!KEYS.includes(body.documentKey)) throw invalid(['documentKey']);
  if (!only(body.content, LOCALES) || !LOCALES.every(l => only(body.content[l], ['title', 'body']) && text(body.content[l].title, 200) && text(body.content[l].body, 100000))) throw invalid(['content']);
  const businessKeys = ['responsibleName', 'address', 'contactEmail', 'privacyEmail', 'commercialRetention'];
  if (!only(body.business, businessKeys) || !businessKeys.every(k => text(body.business[k], k === 'commercialRetention' ? 5000 : 500))) throw invalid(['business']);
  if (typeof body.effectiveAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.effectiveAt) || !Number.isFinite(Date.parse(body.effectiveAt))) throw invalid(['effectiveAt']);
  return { documentKey: body.documentKey, content: body.content, business: body.business, effectiveAt: new Date(body.effectiveAt) };
}
const placeholder = value => /\{\{|\[.*(?:pendiente|completar|placeholder|todo|tbd|responsable|address|email).*\]|\b(?:placeholder|TBD|TODO)\b|example\.(?:com|test)|@.*\.test\b/i.test(value);
function publicationFields(doc) {
  const fields = [];
  for (const l of LOCALES) for (const k of ['title', 'body']) {
    const value = doc.content?.[l]?.[k];
    if (!value?.trim() || placeholder(value)) fields.push(`content.${l}.${k}`);
  }
  for (const k of ['responsibleName', 'address', 'contactEmail', 'privacyEmail', 'commercialRetention']) {
    const v = doc.business?.[k];
    if (!v?.trim() || placeholder(v) || (k.endsWith('Email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) fields.push(`business.${k}`);
  }
  return fields;
}
function present(doc, locale) {
  return {
    id: doc.id, documentKey: doc.documentKey, documentVersion: versionOf(doc),
    effectiveAt: doc.effectiveAt, publishedAt: doc.publishedAt,
    ...(locale ? { locale, ...doc.content[locale] } : { content: doc.content }), business: doc.business
  };
}
async function current(documentKey, { transaction, now = new Date() } = {}) {
  return LegalDocument.findOne({ where: { documentKey, publishedAt: { [Op.ne]: null }, effectiveAt: { [Op.lte]: now } }, order: [['version', 'DESC']], transaction });
}
async function currentSet(keys, options = {}) {
  const docs = await Promise.all(keys.map(k => current(k, options)));
  return docs.filter(Boolean);
}
async function createDraft(actor, body) {
  const values = validateDraft(body);
  return sequelize.transaction(async transaction => {
    const head = await LegalDocumentHead.findByPk(values.documentKey, { transaction, lock: transaction.LOCK.UPDATE });
    const version = head.lastVersion + 1;
    const doc = await LegalDocument.create({ ...values, version, createdById: actor.id }, { transaction });
    await head.update({ lastVersion: version }, { transaction });
    await AuditLog.create({ actorId: actor.id, action: 'legal.draft_created', entityType: 'legal_document', entityId: doc.id, data: { documentKey: doc.documentKey, version } }, { transaction });
    return present(doc);
  });
}
async function publish(actor, id, body) {
  if (!validId(id)) throw fail(404, 'not_found');
  if (!only(body, ['documentVersion']) || typeof body.documentVersion !== 'string') throw invalid(['documentVersion']);
  return sequelize.transaction(async transaction => {
    const reference = await LegalDocument.findByPk(id, { transaction });
    if (!reference) throw fail(404, 'not_found');
    await LegalDocumentHead.findByPk(reference.documentKey, { transaction, lock: transaction.LOCK.UPDATE });
    const doc = await LegalDocument.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (body.documentVersion !== versionOf(doc)) throw fail(409, 'version_conflict');
    if (doc.publishedAt) return present(doc); // reintento, sin fecha ni auditoría nuevas
    const newer = await LegalDocument.findOne({ where: { documentKey: doc.documentKey, version: { [Op.gt]: doc.version }, publishedAt: { [Op.ne]: null } }, transaction });
    if (newer) throw fail(409, 'version_conflict');
    const fields = publicationFields(doc);
    if (fields.length) throw fail(400, 'legal_publication_incomplete', { fields });
    await doc.update({ publishedAt: new Date(), publishedById: actor.id }, { transaction });
    await AuditLog.create({ actorId: actor.id, action: 'legal.published', entityType: 'legal_document', entityId: doc.id, data: { documentKey: doc.documentKey, version: doc.version } }, { transaction });
    return present(doc);
  });
}

// Las referencias se comparan contra los documentos que entregó el servidor, nunca contra texto enviado por el cliente.
function validateConsent(input, docs, locale) {
  if (!LOCALES.includes(locale)) throw invalid(['locale']);
  if (!docs.length && input == null) return;
  if (!only(input, ['accepted', 'documents']) || input.accepted !== true || !Array.isArray(input.documents)) throw fail(400, 'legal_acceptance_required');
  const expected = docs.map(d => `${d.documentKey}:${versionOf(d)}`).sort();
  const actual = input.documents.map(d => only(d, ['documentKey', 'documentVersion']) && typeof d.documentVersion === 'string' ? `${d.documentKey}:${d.documentVersion}` : 'invalid').sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw fail(409, 'legal_version_changed');
}
// legal_acceptances.acceptedAt (W00) es DATETIME sin fracción: se trunca antes de guardar para que la
// respuesta de una inserción coincida con la de una lectura posterior (MySQL redondearía los milisegundos).
const persistedSecond = date => new Date(Math.floor(date.getTime() / 1000) * 1000);
async function recordAcceptances(userId, docs, { locale, context, contextType = null, contextId = null, acceptedAt = new Date(), transaction }) {
  acceptedAt = persistedSecond(acceptedAt);
  // Serializa duplicados entre pestañas incluso cuando el contexto tiene columnas NULL.
  await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
  const result = [];
  for (const doc of docs.filter(d => d.documentKey !== 'privacy')) { // aviso de tratamiento, separado de consentimiento contractual
    const where = { userId, documentKey: doc.documentKey, documentVersion: versionOf(doc), context, contextType, contextId };
    const existing = await LegalAcceptance.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    result.push(existing || await LegalAcceptance.create({ ...where, locale, acceptedAt }, { transaction }));
  }
  return result;
}
async function acceptOwn(user, body) {
  if (!only(body, ['documentKey', 'documentVersion', 'locale', 'context', 'contextType', 'contextId', 'accepted']) || body.accepted !== true || !KEYS.includes(body.documentKey) || body.documentKey === 'privacy' || !LOCALES.includes(body.locale) || !['update', 'checkout'].includes(body.context)) throw invalid();
  return sequelize.transaction(async transaction => {
    let docs;
    let contextType = null, contextId = null;
    if (body.context === 'checkout') {
      if (!validId(body.contextId)) throw invalid(['contextId']);
      if (body.contextType === 'course_checkout') {
        const checkout = await CourseCheckoutSnapshot.findOne({ where: { id: body.contextId, userId: user.id }, transaction });
        if (!checkout) throw fail(404, 'not_found');
        docs = checkout.snapshot.legalDocuments || [];
      } else if (body.contextType === 'class_offer') {
        const offer = await ClassOffer.findOne({ where: { id: body.contextId, buyerId: user.id }, transaction });
        if (!offer) throw fail(404, 'not_found');
        docs = offer.snapshot.legalDocuments || [];
      } else throw invalid(['contextType']);
      contextType = body.contextType; contextId = Number(body.contextId);
    } else {
      if (body.contextType != null || body.contextId != null) throw invalid(['contextType', 'contextId']);
      docs = await currentSet([body.documentKey], { transaction });
    }
    const doc = docs.find(d => d.documentKey === body.documentKey && versionOf(d) === body.documentVersion);
    if (!doc) throw fail(409, 'legal_version_changed');
    const rows = await recordAcceptances(user.id, [doc], { locale: body.locale, context: body.context, contextType, contextId, transaction });
    return rows[0];
  });
}
module.exports = { KEYS, LOCALES, fail, invalid, plain, only, validId, current, currentSet, present, createDraft, publish, validateConsent, persistedSecond, recordAcceptances, acceptOwn, publicationFields };
