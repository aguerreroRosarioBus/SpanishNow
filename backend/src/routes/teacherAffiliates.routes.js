// Teacher's affiliates: CRUD, private-link token, attributed orders and payouts. Only the teacher's own affiliates.
const express = require('express');
const router = express.Router();
const { UniqueConstraintError } = require('sequelize');
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const sequelize = require('../config/database');
const { Affiliate, AffiliatePayout, Order } = require('../models');
const affiliates = require('../services/affiliateService');
const sales = require('../services/salesService');

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
const MAX_CODE_ATTEMPTS = 8;

router.use('/affiliates', authMiddleware, isTeacher);

/** Loads :id and checks it is the teacher's. Answers 404/403 itself and returns null when not. */
async function ownAffiliate(req, res, options = {}) {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Affiliate not found' }); return null; }
  const affiliate = await Affiliate.findByPk(req.params.id, options);
  if (!affiliate) { res.status(404).json({ error: 'Affiliate not found' }); return null; }
  if (affiliate.teacherId !== req.user.id) { res.status(403).json({ error: 'Not authorized' }); return null; }
  return affiliate;
}

const withStats = async affiliate => affiliates.present(affiliate, (await affiliates.statsFor([affiliate.id])).get(affiliate.id));

router.get('/affiliates', async (req, res) => {
  try {
    const rows = await Affiliate.findAll({ where: { teacherId: req.user.id }, order: [['id', 'DESC']] });
    const stats = await affiliates.statsFor(rows.map(row => row.id));
    res.json(rows.map(row => affiliates.present(row, stats.get(row.id))));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/affiliates', async (req, res) => {
  try {
    const parsed = affiliates.parseInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    // A code chosen by the teacher must be free; a generated one is retried until it is.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        const affiliate = await Affiliate.create({
          active: true, ...parsed.values, code: parsed.values.code || affiliates.generateCode(parsed.values.name),
          teacherId: req.user.id, dashboardToken: affiliates.generateToken()
        });
        return res.status(201).json(affiliates.present(affiliate, []));
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) throw error;
        if (parsed.values.code) return res.status(409).json({ error: 'That code is already in use' });
      }
    }
    res.status(500).json({ error: 'Could not generate a free code, try again' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The percentage only affects sales made after the change: every order keeps the one it was fulfilled with.
router.put('/affiliates/:id', async (req, res) => {
  try {
    const affiliate = await ownAffiliate(req, res);
    if (!affiliate) return;
    const parsed = affiliates.parseInput(req.body || {}, affiliate);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await affiliate.update(parsed.values);
    res.json(await withStats(affiliate));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The old link stops working at once.
router.post('/affiliates/:id/regenerate-token', async (req, res) => {
  try {
    const affiliate = await ownAffiliate(req, res);
    if (!affiliate) return;
    await affiliate.update({ dashboardToken: affiliates.generateToken() });
    res.json({ dashboardToken: affiliate.dashboardToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// With sales (or payouts) the affiliate is part of the accounting history: it is deactivated instead of deleted.
router.delete('/affiliates/:id', async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      if (!validId(req.params.id)) return { status: 404, error: 'Affiliate not found' };
      const affiliate = await Affiliate.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!affiliate) return { status: 404, error: 'Affiliate not found' };
      if (affiliate.teacherId !== req.user.id) return { status: 403, error: 'Not authorized' };
      const used = await Order.count({ where: { affiliateId: affiliate.id }, transaction }) + await AffiliatePayout.count({ where: { affiliateId: affiliate.id }, transaction });
      if (used > 0) {
        await affiliate.update({ active: false }, { transaction });
        return { status: 409, error: 'This affiliate has sales or payouts, so it was deactivated instead of deleted', deactivated: true };
      }
      await affiliate.destroy({ transaction });
      return { status: 204 };
    });
    if (result.status === 204) return res.status(204).end();
    res.status(result.status).json({ error: result.error, ...(result.deactivated ? { deactivated: true } : {}) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Same shape and filters as /teacher/orders (status, courseId, q, page, pageSize), only the orders of this affiliate.
router.get('/affiliates/:id/orders', async (req, res) => {
  try {
    const affiliate = await ownAffiliate(req, res);
    if (!affiliate) return;
    const result = await sales.listOrders(req.user.id, req.query, { affiliateId: affiliate.id });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/affiliates/:id/payouts', async (req, res) => {
  try {
    const affiliate = await ownAffiliate(req, res);
    if (!affiliate) return;
    const rows = await AffiliatePayout.findAll({ where: { affiliateId: affiliate.id }, order: [['paidAt', 'DESC'], ['id', 'DESC']] });
    res.json(rows.map(affiliates.presentPayout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/affiliates/:id/payouts', async (req, res) => {
  try {
    const affiliate = await ownAffiliate(req, res);
    if (!affiliate) return;
    const parsed = affiliates.parsePayout(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const payout = await AffiliatePayout.create({ ...parsed.values, affiliateId: affiliate.id });
    res.status(201).json(affiliates.presentPayout(payout));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/affiliates/:id/payouts/:payoutId', async (req, res) => {
  try {
    const affiliate = await ownAffiliate(req, res);
    if (!affiliate) return;
    if (!validId(req.params.payoutId)) return res.status(404).json({ error: 'Payout not found' });
    const payout = await AffiliatePayout.findOne({ where: { id: req.params.payoutId, affiliateId: affiliate.id } });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    await payout.destroy();
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
