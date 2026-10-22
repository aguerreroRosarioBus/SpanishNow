// Orders: fulfilment of a paid order (shared by the Stripe webhook and the fake payment mode).
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { Order, Enrollment, Course, LessonProgress, LessonAnswer, LessonReinforcement, UnitQuizAttempt, Certificate } = require('../models');
const { findOrCreateStudent, normalizeEmail } = require('./accounts');
const { createToken } = require('./passwordTokens');
const { sendMail } = require('./mailService');
const templates = require('./emailTemplates');
const { CouponError } = require('./couponService');
const affiliates = require('./affiliateService');

/**
 * Marks the order paid, gives the buyer access and emails them. Safe to call any number of times for the same order
 * (webhook retries, duplicated events, concurrent deliveries): only the first call does anything.
 *   1. already paid -> nothing
 *   2. finds the buyer by email, or creates a student with an unusable random password
 *   3. creates the enrollment (source 'purchase'), never a second one
 *   4. marks the order paid and stores the receipt link when the provider gave one
 *   5. fixes the affiliate's commission, if the order came through one (see affiliateService.recordCommission)
 *   6. counts the coupon use (once per order: only the call that marks it paid gets here)
 *   7. confirmation email (with a set-password link when the account is new)
 * `payment` may carry what the provider reported: { email, name, paymentId, receiptUrl }.
 * `strictCoupon`: refuse (CouponError, nothing saved) when the coupon has no uses left. Used for orders that are fulfilled
 * in the same request that created them (100 % discount). A purchase already paid at the provider is always honoured
 * (the use is counted only while below maxRedemptions).
 * A refunded order is never fulfilled again (replayed webhooks).
 * Returns { order, alreadyPaid, user, enrollment, userCreated, emailSent }.
 */
async function fulfillOrder(orderOrId, payment = {}, { strictCoupon = false } = {}) {
  const orderId = typeof orderOrId === 'object' ? orderOrId.id : orderOrId;

  const outcome = await sequelize.transaction(async transaction => {
    // The row lock serializes concurrent fulfilments of the same order.
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status === 'paid' || order.status === 'refunded') return { order, alreadyPaid: true };

    const email = normalizeEmail(payment.email || order.email);
    if (!email) throw new Error(`Order ${order.id} has no buyer email`);

    const { user, created: userCreated } = await findOrCreateStudent({ email, name: payment.name }, { transaction });

    const [enrollment] = await Enrollment.findOrCreate({
      where: { studentId: user.id, courseId: order.courseId },
      defaults: { studentId: user.id, courseId: order.courseId, source: 'purchase', orderId: order.id },
      transaction
    });
    if (!enrollment.orderId) await enrollment.update({ orderId: order.id }, { transaction });

    await order.update({
      status: 'paid',
      paidAt: new Date(),
      userId: user.id,
      email,
      providerPaymentId: payment.paymentId || order.providerPaymentId,
      receiptUrl: payment.receiptUrl ? String(payment.receiptUrl).slice(0, 500) : order.receiptUrl
    }, { transaction });

    // Commission of the affiliate (if any), with the percentage of today, in the same transaction as the payment.
    await affiliates.recordCommission(order, email, transaction);

    if (order.couponId) {
      // One atomic statement: the limit is checked and the use counted without a read-modify-write race.
      const [, used] = await sequelize.query(
        'UPDATE coupons SET redemptions = redemptions + 1 WHERE id = ? AND (maxRedemptions IS NULL OR redemptions < maxRedemptions)',
        { replacements: [order.couponId], type: QueryTypes.UPDATE, transaction }
      );
      if (strictCoupon && !used) throw new CouponError('coupon_exhausted', 'This coupon has no uses left');
    }

    // The invite token is created with the order, so it exists exactly when the email below is sent.
    const inviteToken = userCreated ? await createToken(user, 'invite', { transaction }) : null;
    return { order, alreadyPaid: false, user, enrollment, userCreated, inviteToken };
  });

  if (outcome.alreadyPaid) return { order: outcome.order, alreadyPaid: true };

  // Outside the transaction: a mail failure must not undo a payment that already happened.
  let emailSent = true;
  try {
    const course = await Course.findByPk(outcome.order.courseId);
    await sendMail({
      to: outcome.user.email,
      ...templates.purchaseConfirmation({
        name: outcome.user.name, course, amount: outcome.order.amount, currency: outcome.order.currency, inviteToken: outcome.inviteToken, locale: outcome.user.locale
      })
    });
  } catch (error) {
    emailSent = false;
    console.error(`Purchase email for order ${outcome.order.id} failed:`, error.message);
  }
  return { order: outcome.order, alreadyPaid: false, user: outcome.user, enrollment: outcome.enrollment, userCreated: outcome.userCreated, emailSent };
}

/** Deletes an enrolment with the student's progress in it (same effect as the teacher removing the student). */
async function removeEnrollment(enrollment, transaction) {
  const rows = await LessonProgress.findAll({ where: { enrollmentId: enrollment.id }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
  const ids = rows.map(row => row.id);
  if (ids.length) {
    await LessonAnswer.destroy({ where: { lessonProgressId: ids }, transaction });
    await LessonReinforcement.destroy({ where: { lessonProgressId: ids }, transaction });
    await LessonProgress.destroy({ where: { id: ids }, transaction });
  }
  await UnitQuizAttempt.destroy({ where: { enrollmentId: enrollment.id }, transaction });
  await Certificate.destroy({ where: { enrollmentId: enrollment.id }, transaction });
  await enrollment.destroy({ transaction });
}

/**
 * Records that money of an order was returned. Idempotent and monotonic: `refundedAmount` is the CUMULATIVE amount the
 * provider reports (never an increment), so a replayed or out-of-order event cannot make the total grow or shrink.
 *   - partial (refundedAmount < order.amount): only the amount is stored; the order stays 'paid' and keeps its access
 *   - total (`full`, or refundedAmount >= amount): status 'refunded' and, with `revokeAccess`, the enrolment this order
 *     created (source 'purchase' and orderId = this order) is removed. Enrolments from other sources are never touched.
 * Returns { applied, reason?, order, status, accessRevoked }. `applied` is false when nothing changed.
 */
async function registerRefund(orderId, { refundedAmount = 0, full = false, revokeAccess = true } = {}) {
  return sequelize.transaction(async transaction => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) return { applied: false, reason: 'not_found' };
    if (order.status !== 'paid' && order.status !== 'refunded') return { applied: false, reason: 'not_paid', order };
    if (order.status === 'refunded') return { applied: false, reason: 'already_refunded', order };

    const returned = Math.min(order.amount, Math.max(order.refundedAmount, Number(refundedAmount) || 0));
    const total = full || (order.amount > 0 && returned >= order.amount);
    const amount = total ? order.amount : returned;
    if (!total && amount === order.refundedAmount) return { applied: false, reason: 'unchanged', order };

    await order.update({ refundedAmount: amount, refundedAt: new Date(), ...(total ? { status: 'refunded' } : {}) }, { transaction });
    // The affiliate's commission follows the cumulative refunded amount (void on a total refund), so replays give the same result.
    await affiliates.adjustForRefund(order, { total }, transaction);

    let accessRevoked = 0;
    if (total && revokeAccess) {
      const enrollments = await Enrollment.findAll({ where: { orderId: order.id, source: 'purchase' }, transaction, lock: transaction.LOCK.UPDATE });
      for (const enrollment of enrollments) await removeEnrollment(enrollment, transaction);
      accessRevoked = enrollments.length;
    }
    return { applied: true, order, total, accessRevoked };
  });
}

module.exports = { fulfillOrder, registerRefund, removeEnrollment };
