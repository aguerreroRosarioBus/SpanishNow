const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middlewares/auth.middleware');
const { Course, Enrollment, Order } = require('../models');
const { createCheckout, PaymentError } = require('../services/paymentService');
const { hasPendingInvite } = require('../services/passwordTokens');
const { priceFor, quoteShape, CouponError } = require('../services/couponService');
const { resolveCode } = require('../services/affiliateService');

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

const couponFailure = (res, error) => res.status(error.status).json({ error: error.message, code: error.code });

// Price of a course with a coupon, to show the discount before paying. Public: nothing is created or consumed.
// `affiliateCode` is accepted for symmetry with POST /checkout and ignored: the buyer pays the same price with or without it.
router.post('/quote', async (req, res) => {
  try {
    const { courseId, couponCode } = req.body || {};
    if (!validId(courseId)) return res.status(400).json({ error: 'courseId is required' });
    if (typeof couponCode !== 'string' || !couponCode.trim()) return res.status(400).json({ error: 'couponCode is required', code: 'coupon_invalid' });

    const course = await Course.findByPk(courseId);
    if (!course || !course.isPublished) return res.status(404).json({ error: 'Course not found' });
    if (course.price <= 0) return res.status(400).json({ error: 'This course is free: enroll instead of buying it' });

    res.json(quoteShape(await priceFor(course, couponCode)));
  } catch (error) {
    if (error instanceof CouponError) return couponFailure(res, error);
    res.status(500).json({ error: error.message });
  }
});

// Start a purchase. Login is optional: a logged-in student buys with their own account.
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { courseId, email, couponCode, affiliateCode } = req.body || {};
    if (!validId(courseId)) return res.status(400).json({ error: 'courseId is required' });
    if (couponCode !== undefined && couponCode !== null && typeof couponCode !== 'string') return res.status(400).json({ error: 'couponCode must be text', code: 'coupon_invalid' });

    const course = await Course.findByPk(courseId);
    if (!course || !course.isPublished) return res.status(404).json({ error: 'Course not found' });
    if (course.price <= 0) return res.status(400).json({ error: 'This course is free: enroll instead of buying it' });

    if (req.user && req.user.role !== 'student') return res.status(403).json({ error: 'Only students can buy a course' });
    if (req.user) {
      const enrolled = await Enrollment.findOne({ where: { studentId: req.user.id, courseId: course.id } });
      if (enrolled) return res.status(409).json({ error: 'You are already enrolled in this course' });
    }

    const pricing = await priceFor(course, couponCode);
    // Attribution (last click, kept by the web app): a code that is invalid, inactive or another teacher's is ignored, never an error.
    const affiliate = await resolveCode(affiliateCode, course);
    const { url } = await createCheckout({ course, user: req.user, fakeEmail: email, pricing, affiliate });
    res.json({ url });
  } catch (error) {
    if (error instanceof CouponError) return couponFailure(res, error);
    if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message, ...error.extra });
    res.status(500).json({ error: error.message });
  }
});

// State of a purchase, for the success page. The session id (unguessable) is the only credential.
router.get('/session/:sessionId', async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId);
    if (sessionId.length > 255) return res.status(404).json({ error: 'Session not found' });
    const order = await Order.findOne({ where: { providerSessionId: sessionId }, include: [{ model: Course, as: 'course', attributes: ['title', 'slug'] }] });
    if (!order) return res.status(404).json({ error: 'Session not found' });

    const paid = order.status === 'paid' || order.status === 'refunded';
    res.json({
      status: paid ? 'paid' : 'pending',
      course: { title: order.course.title, slug: order.course.slug },
      email: order.email || '',
      needsPassword: paid && order.userId ? await hasPendingInvite(order.userId) : false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
