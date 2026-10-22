// Checkout (Stripe Checkout, or the fake provider when PAYMENTS_FAKE=1) and Stripe webhook events.
const { randomUUID } = require('crypto');
const Stripe = require('stripe');
const payments = require('../config/payments');
const { Order, Enrollment } = require('../models');
const { fulfillOrder, registerRefund } = require('./orderService');
const { normalizeEmail, isValidEmail, findUserByEmail } = require('./accounts');

class PaymentError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

let stripeClient = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new PaymentError(503, 'Payments are not configured');
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

/** Tests inject a fake Stripe client here; production never calls it. */
function setStripeClient(client) { stripeClient = client; }

const successUrl = sessionPlaceholder => `${payments.frontendUrl()}/checkout/success?session_id=${sessionPlaceholder}`;

/**
 * Starts a purchase of `course` and returns the URL to send the buyer to.
 * `user` is the logged-in student, if any. `fakeEmail` is only honoured by the fake provider and by orders that need no
 * payment (there is no Stripe form to ask it). `pricing` is what couponService.priceFor returned (price after the coupon).
 * Preconditions (published, priced, not enrolled) are checked by the route.
 * `affiliate` (Affiliate row, optional) is stored on the order; its commission is computed when the order is fulfilled.
 * A final price of 0 (100 % coupon) creates an order with provider 'coupon' and fulfils it on the spot, without Stripe.
 */
async function createCheckout({ course, user, fakeEmail, pricing, affiliate = null, recordEvidence = null }) {
  const price = pricing || { originalAmount: course.price, discountAmount: 0, amount: course.price, currency: String(course.currency).toLowerCase(), coupon: null };
  const base = {
    courseId: course.id, amount: price.amount, currency: price.currency,
    originalAmount: price.originalAmount, discountAmount: price.discountAmount, couponId: price.coupon ? price.coupon.id : null,
    affiliateId: affiliate ? affiliate.id : null
  };

  if (price.amount === 0) {
    const requested = normalizeEmail(fakeEmail);
    const email = user ? user.email : requested;
    if (!isValidEmail(email)) throw new PaymentError(400, 'A valid email is required to get this course for free');
    if (!user) {
      const existing = await findUserByEmail(email);
      if (existing && await Enrollment.findOne({ where: { studentId: existing.id, courseId: course.id } })) {
        throw new PaymentError(409, 'You are already enrolled in this course');
      }
    }
    const sessionId = `coupon_${randomUUID().replace(/-/g, '')}`;
    const order = await Order.create({ ...base, email, userId: user ? user.id : null, provider: 'coupon', providerSessionId: sessionId });
    if (recordEvidence) await recordEvidence(order.id); // W02: instantánea y aceptación junto a la orden creada
    try {
      await fulfillOrder(order, { email }, { strictCoupon: true });
    } catch (error) {
      await order.update({ status: 'failed' }).catch(() => {});
      throw error;
    }
    return { url: successUrl(sessionId), orderId: order.id };
  }

  if (payments.fake()) {
    const requested = normalizeEmail(fakeEmail);
    const email = user ? user.email : (isValidEmail(requested) ? requested : `fake-buyer-${randomUUID().slice(0, 8)}@spanishnow.test`);
    const sessionId = `fake_${randomUUID().replace(/-/g, '')}`;
    const order = await Order.create({ ...base, email, userId: user ? user.id : null, provider: 'fake', providerSessionId: sessionId });
    if (recordEvidence) await recordEvidence(order.id); // W02: instantánea y aceptación junto a la orden creada
    // Same function the Stripe webhook calls: the order is paid right away.
    await fulfillOrder(order, { email });
    return { url: successUrl(sessionId), orderId: order.id };
  }

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: base.currency,
          unit_amount: base.amount,
          product_data: {
            name: course.title,
            ...(course.description ? { description: course.description.slice(0, 500) } : {}),
            ...(course.imageUrl && /^https:\/\//.test(course.imageUrl) ? { images: [course.imageUrl] } : {})
          }
        }
      }],
      ...(user ? { customer_email: user.email } : {}),
      client_reference_id: String(course.id),
      metadata: {
        courseId: String(course.id),
        ...(user ? { userId: String(user.id) } : {}),
        ...(price.coupon ? { couponCode: price.coupon.code } : {})
      },
      success_url: successUrl('{CHECKOUT_SESSION_ID}'),
      cancel_url: `${payments.frontendUrl()}/courses/${course.slug}`
    });
  } catch (error) {
    console.error('Stripe checkout session failed:', error.message);
    throw new PaymentError(502, 'The payment provider is not available right now. Please try again.');
  }
  const order = await Order.create({
    ...base, email: user ? user.email : null, userId: user ? user.id : null, provider: 'stripe', providerSessionId: session.id
  });
  if (recordEvidence) await recordEvidence(order.id); // W02: instantánea y aceptación junto a la orden creada
  return { url: session.url, orderId: order.id };
}

const FULFIL_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/** Verifies the signature of a Stripe webhook delivery and returns the event. Throws PaymentError. */
function verifyStripeEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentError(503, 'Webhook is not configured');
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    throw new PaymentError(400, 'Invalid webhook signature');
  }
}

const paymentIntentId = value => (typeof value === 'string' ? value : value && value.id) || null;

/** Link to Stripe's receipt of a payment. Best effort: a failure here must never block fulfilling a paid order. */
async function fetchReceiptUrl(paymentIntent) {
  const id = paymentIntentId(paymentIntent);
  if (!id) return null;
  try {
    const intent = await getStripe().paymentIntents.retrieve(id, { expand: ['latest_charge'] });
    const charge = intent && intent.latest_charge;
    return charge && typeof charge === 'object' && charge.receipt_url ? charge.receipt_url : null;
  } catch (error) {
    if (!(error instanceof PaymentError)) console.warn(`Receipt of ${id} could not be fetched:`, error.message);
    return null;
  }
}

async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  if (session.payment_status !== 'paid') return { handled: false }; // e.g. delayed method still processing
  const order = await Order.findOne({ where: { providerSessionId: session.id, provider: 'stripe' } });
  if (!order) {
    console.warn(`Stripe session ${session.id} has no order; ignored`);
    return { handled: false };
  }
  if (session.amount_total != null && session.amount_total !== order.amount) {
    console.warn(`Order ${order.id}: Stripe charged ${session.amount_total} but the order says ${order.amount}`);
  }
  const details = session.customer_details || {};
  const paymentId = paymentIntentId(session.payment_intent);
  // Only the first delivery needs the receipt; replays find the order already paid.
  const receiptUrl = order.status === 'pending' ? await fetchReceiptUrl(paymentId) : null;
  const result = await fulfillOrder(order, { email: details.email || session.customer_email, name: details.name, paymentId, receiptUrl });
  return { handled: true, alreadyPaid: result.alreadyPaid };
}

/**
 * charge.refunded: Stripe sends the charge with `amount_refunded`, the TOTAL returned so far (not this refund's amount),
 * so replays and out-of-order deliveries are harmless. Total refund: order 'refunded' and the purchase access removed.
 * Partial refund: only the amount is recorded.
 */
async function handleChargeRefunded(event) {
  const charge = event.data.object;
  const paymentId = paymentIntentId(charge.payment_intent);
  const order = paymentId ? await Order.findOne({ where: { providerPaymentId: paymentId, provider: 'stripe' } }) : null;
  if (!order) {
    console.warn(`Stripe charge ${charge.id} has no order; ignored`);
    return { handled: false };
  }
  const refundedAmount = Number(charge.amount_refunded) || 0;
  const result = await registerRefund(order.id, { refundedAmount, full: charge.refunded === true, revokeAccess: true });
  if (result.reason === 'not_paid') {
    // The refund cannot be applied to an order that was never paid; Stripe should not retry it.
    console.warn(`Order ${order.id} is ${result.order.status}; refund event ${event.id} ignored`);
    return { handled: false };
  }
  return { handled: true, applied: result.applied };
}

/** Applies a verified event. Replays are harmless: fulfillOrder and registerRefund only act once per change. */
async function handleStripeEvent(event) {
  if (FULFIL_EVENTS.has(event.type)) return handleCheckoutCompleted(event);
  if (event.type === 'charge.refunded') return handleChargeRefunded(event);
  return { handled: false };
}

module.exports = { createCheckout, verifyStripeEvent, handleStripeEvent, fetchReceiptUrl, setStripeClient, PaymentError };
