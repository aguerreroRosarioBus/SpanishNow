// What the logged-in user has bought.
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { Order, Course } = require('../models');

// W01: preferencias propias independientes de compras, sin flag comercial.
router.use('/preferences', require('./preferences.routes'));

// Paid (or since refunded) orders of the user, newest first.
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { userId: req.user.id, status: ['paid', 'refunded'] },
      include: [{ model: Course, as: 'course', attributes: ['title', 'slug'] }],
      order: [['paidAt', 'DESC'], ['id', 'DESC']]
    });
    res.json(orders.map(order => ({
      id: order.id,
      paidAt: order.paidAt,
      course: { title: order.course.title, slug: order.course.slug },
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      refundedAmount: order.refundedAmount,
      receiptUrl: order.receiptUrl
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
