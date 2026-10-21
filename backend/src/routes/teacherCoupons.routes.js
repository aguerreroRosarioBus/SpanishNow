// Teacher's coupons: list, create, edit and delete. Only the teacher's own.
const express = require('express');
const router = express.Router();
const { UniqueConstraintError } = require('sequelize');
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const sequelize = require('../config/database');
const { Coupon, Course, Order } = require('../models');
const coupons = require('../services/couponService');

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
const COURSE_ONLY = { model: Course, as: 'course', attributes: ['id', 'title', 'currency'], required: false };

router.use('/coupons', authMiddleware, isTeacher);

// The coupon's course must be the teacher's, and a fixed-amount coupon must be in that course's currency.
// Returns the Course (or null for "all courses"), or { error, status }.
async function checkScope(values, teacherId) {
  if (values.courseId == null) return null;
  const course = await Course.findByPk(values.courseId, { attributes: ['id', 'title', 'currency', 'teacherId'] });
  if (!course || course.teacherId !== teacherId) return { error: 'courseId must be one of your courses', status: 400 };
  if (values.amountOff != null && String(course.currency).toLowerCase() !== values.currency) {
    return { error: `This course is priced in ${String(course.currency).toUpperCase()}: a fixed-amount coupon for it must use the same currency`, status: 400 };
  }
  return course;
}

router.get('/coupons', async (req, res) => {
  try {
    const rows = await Coupon.findAll({ where: { teacherId: req.user.id }, include: [COURSE_ONLY], order: [['id', 'DESC']] });
    res.json(rows.map(row => coupons.present(row, row.course)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    const parsed = coupons.parseInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const course = await checkScope(parsed.values, req.user.id);
    if (course && course.error) return res.status(course.status).json({ error: course.error });
    const coupon = await Coupon.create({ ...parsed.values, teacherId: req.user.id });
    res.status(201).json(coupons.present(coupon, course));
  } catch (error) {
    if (error instanceof UniqueConstraintError) return res.status(409).json({ error: 'That code is already in use' });
    res.status(500).json({ error: error.message });
  }
});

const sameDiscount = (a, b) => ['code', 'percentOff', 'amountOff', 'currency', 'courseId'].every(key => a[key] === b[key]);

router.put('/coupons/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Coupon not found' });
    const result = await sequelize.transaction(async transaction => {
      // The row lock keeps a purchase being fulfilled from changing `redemptions` between the check and the update.
      const coupon = await Coupon.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!coupon) return { status: 404, error: 'Coupon not found' };
      if (coupon.teacherId !== req.user.id) return { status: 403, error: 'Not authorized' };

      const parsed = coupons.parseInput(req.body || {}, coupon);
      if (parsed.error) return { status: 400, error: parsed.error };
      const { values } = parsed;
      if (coupon.redemptions > 0 && !sameDiscount(coupon, values)) {
        return { status: 409, error: 'This coupon has already been used: only active, expiresAt and maxRedemptions can change' };
      }
      if (values.maxRedemptions != null && values.maxRedemptions < coupon.redemptions) {
        return { status: 400, error: 'maxRedemptions cannot be lower than the number of uses so far' };
      }
      const course = await checkScope(values, req.user.id);
      if (course && course.error) return { status: course.status, error: course.error };
      await coupon.update(values, { transaction });
      return { coupon, course: course || null };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(coupons.present(result.coupon, result.course));
  } catch (error) {
    if (error instanceof UniqueConstraintError) return res.status(409).json({ error: 'That code is already in use' });
    res.status(500).json({ error: error.message });
  }
});

// A coupon with uses is part of the sales history: it is deactivated instead of deleted.
router.delete('/coupons/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Coupon not found' });
    const result = await sequelize.transaction(async transaction => {
      const coupon = await Coupon.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!coupon) return { status: 404, error: 'Coupon not found' };
      if (coupon.teacherId !== req.user.id) return { status: 403, error: 'Not authorized' };
      const paidOrders = await Order.count({ where: { couponId: coupon.id, status: ['paid', 'refunded'] }, transaction });
      if (coupon.redemptions > 0 || paidOrders > 0) {
        await coupon.update({ active: false }, { transaction });
        return { status: 409, error: 'This coupon has been used, so it was deactivated instead of deleted', deactivated: true };
      }
      await coupon.destroy({ transaction });
      return { status: 204 };
    });
    if (result.status === 204) return res.status(204).end();
    res.status(result.status).json({ error: result.error, ...(result.deactivated ? { deactivated: true } : {}) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
