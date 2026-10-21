// Orders: fulfilment of a paid order (shared by the Stripe webhook and the fake payment mode).
const sequelize = require('../config/database');
const { Order, Enrollment, Course } = require('../models');
const { findOrCreateStudent, normalizeEmail } = require('./accounts');
const { createToken } = require('./passwordTokens');
const { sendMail } = require('./mailService');
const templates = require('./emailTemplates');

/**
 * Marks the order paid, gives the buyer access and emails them. Safe to call any number of times for the same order
 * (webhook retries, duplicated events, concurrent deliveries): only the first call does anything.
 *   1. already paid -> nothing
 *   2. finds the buyer by email, or creates a student with an unusable random password
 *   3. creates the enrollment (source 'purchase'), never a second one
 *   4. marks the order paid
 *   5. confirmation email (with a set-password link when the account is new)
 * `payment` may carry what the provider reported: { email, name, paymentId }.
 * Returns { order, alreadyPaid, user, enrollment, userCreated, emailSent }.
 */
async function fulfillOrder(orderOrId, payment = {}) {
  const orderId = typeof orderOrId === 'object' ? orderOrId.id : orderOrId;

  const outcome = await sequelize.transaction(async transaction => {
    // The row lock serializes concurrent fulfilments of the same order.
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status === 'paid') return { order, alreadyPaid: true };

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
      providerPaymentId: payment.paymentId || order.providerPaymentId
    }, { transaction });

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
        name: outcome.user.name, course, amount: outcome.order.amount, currency: outcome.order.currency, inviteToken: outcome.inviteToken
      })
    });
  } catch (error) {
    emailSent = false;
    console.error(`Purchase email for order ${outcome.order.id} failed:`, error.message);
  }
  return { order: outcome.order, alreadyPaid: false, user: outcome.user, enrollment: outcome.enrollment, userCreated: outcome.userCreated, emailSent };
}

module.exports = { fulfillOrder };
