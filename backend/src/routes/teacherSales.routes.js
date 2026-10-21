// Teacher's view of sales: summary, orders (list and CSV) and manual refunds. Only the orders of the teacher's own courses.
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Order, Course, User, Coupon, Affiliate } = require('../models');
const sales = require('../services/salesService');
const { registerRefund } = require('../services/orderService');

for (const prefix of ['/sales', '/orders']) router.use(prefix, authMiddleware, isTeacher);

router.get('/sales/summary', async (req, res) => {
  try {
    const range = sales.parseRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    res.json(await sales.summary(req.user.id, range));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const result = await sales.listOrders(req.user.id, req.query);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Same filters as the list, no paging. Written in batches so a long history never sits in memory at once.
router.get('/orders/export.csv', async (req, res) => {
  try {
    let started = false;
    const result = await sales.eachOrderBatch(req.user.id, req.query, async rows => {
      if (!started) {
        started = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.write(`﻿${sales.csvHeader()}`); // BOM: Excel opens it as UTF-8
      }
      res.write(rows.map(sales.csvLine).join(''));
    });
    if (result.error) return res.status(400).json({ error: result.error });
    if (!started) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.write(`﻿${sales.csvHeader()}`);
    }
    res.end();
  } catch (error) {
    console.error('Orders export failed:', error.message);
    if (res.headersSent) return res.end(); // the file is already streaming: cut it, the download will look incomplete
    res.status(500).json({ error: error.message });
  }
});

const parseBoolean = value => (value === true || value === 'true' || value === 1 || value === '1' ? true
  : value === false || value === 'false' || value === 0 || value === '0' ? false : null);

// Marks the whole order as refunded (for fake orders, or refunds made outside Stripe). Stripe orders are refunded in Stripe.
router.post('/orders/:id/refund', async (req, res) => {
  try {
    if (!sales.validId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
    const order = await Order.findByPk(req.params.id, { include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'teacherId'] }] });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const body = req.body || {};
    const revokeAccess = body.revokeAccess === undefined ? true : parseBoolean(body.revokeAccess);
    if (revokeAccess === null) return res.status(400).json({ error: 'revokeAccess must be true or false' });
    const manual = body.manual === undefined ? false : parseBoolean(body.manual);
    if (manual === null) return res.status(400).json({ error: 'manual must be true or false' });

    if (order.status === 'refunded') return res.status(409).json({ error: 'This order is already refunded' });
    if (order.status !== 'paid') return res.status(409).json({ error: 'Only paid orders can be refunded' });
    if (order.provider === 'stripe' && !manual) {
      return res.status(409).json({
        error: 'This order was paid with Stripe: refund it from the Stripe dashboard and SpanishNow will record it automatically.',
        code: 'refund_in_stripe'
      });
    }

    const result = await registerRefund(order.id, { full: true, revokeAccess });
    if (!result.applied) return res.status(409).json({ error: 'This order cannot be refunded' });

    const fresh = await Order.findByPk(order.id, { include: [
      { model: Course, as: 'course', attributes: ['id', 'title'] },
      { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      { model: Coupon, as: 'coupon', attributes: ['code'] },
      { model: Affiliate, as: 'affiliate', attributes: ['id', 'name', 'code'] }
    ] });
    res.json({ ...sales.present(fresh), accessRevoked: result.accessRevoked > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
