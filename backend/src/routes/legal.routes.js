const express = require('express');
const { Op } = require('sequelize');
const { authMiddleware, requirePermission } = require('../middlewares/auth.middleware');
const LegalDocument = require('../models/LegalDocument');
const legal = require('../services/legalDocuments');
const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Estado sin borradores: permite que registro/compra muestren las versiones exactas que se aceptarán.
router.get('/public/legal', wrap(async (req, res) => {
  const locale = req.query.locale || 'en';
  if (!legal.LOCALES.includes(locale)) throw legal.invalid(['locale']);
  const docs = await legal.currentSet(legal.KEYS);
  res.json(docs.map(doc => legal.present(doc, locale)));
}));
router.get('/public/legal/:documentKey', wrap(async (req, res) => {
  if (!legal.KEYS.includes(req.params.documentKey)) throw legal.fail(404, 'not_found');
  const locale = req.query.locale || 'en';
  if (!legal.LOCALES.includes(locale)) throw legal.invalid(['locale']);
  // Las versiones publicadas antiguas siguen accesibles desde comprobantes/aceptaciones.
  let doc;
  if (req.query.version !== undefined) {
    if (!legal.validId(req.query.version)) throw legal.invalid(['version']);
    doc = await LegalDocument.findOne({ where: { documentKey: req.params.documentKey, version: Number(req.query.version), publishedAt: { [Op.ne]: null }, effectiveAt: { [Op.lte]: new Date() } } });
  } else doc = await legal.current(req.params.documentKey);
  if (!doc) throw legal.fail(404, 'not_found');
  res.set('Cache-Control', 'no-store').json(legal.present(doc, locale));
}));
router.get('/admin/legal-documents', authMiddleware, requirePermission('legal.manage'), wrap(async (req, res) => {
  const docs = await LegalDocument.findAll({ order: [['id', 'DESC']], limit: 200 });
  res.json(docs.map(d => legal.present(d)));
}));
router.post('/admin/legal-documents', authMiddleware, requirePermission('legal.manage'), wrap(async (req, res) => {
  res.status(201).json(await legal.createDraft(req.user, req.body));
}));
router.post('/admin/legal-documents/:id/publish', authMiddleware, requirePermission('legal.manage'), wrap(async (req, res) => {
  res.json(await legal.publish(req.user, req.params.id, req.body));
}));
router.post('/me/legal-acceptances', authMiddleware, wrap(async (req, res) => {
  if (req.impersonatedBy) throw legal.fail(403, 'forbidden');
  res.status(201).json(await legal.acceptOwn(req.user, req.body));
}));
module.exports = router;
