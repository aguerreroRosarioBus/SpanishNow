// Checkout (Stripe Checkout, or the fake provider when PAYMENTS_FAKE=1) and Stripe webhook events.
const { randomUUID } = require('crypto');
const Stripe = require('stripe');
const payments = require('../config/payments');
const { Order } = require('../models');
const { fulfillOrder } = require('./orderService');
const { normalizeEmail, isValidEmail } = require('./accounts');

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

const successUrl = sessionPlaceholder => `${payments.frontendUrl()}/checkout/success?session_id=${sessionPlaceholder}`;

/**
 * Starts a purchase of `course` and returns the URL to send the buyer to.
 * `user` is the logged-in student, if any. `fakeEmail` is only honoured by the fake provider (there is no Stripe form to ask it).
 * Preconditions (published, priced, not enrolled) are checked by the route.
 */
async function createCheckout({ course, user, fakeEmail }) {
  const base = { courseId: course.id, amount: course.price, currency: String(course.currency).toLowerCase() };

  if (payments.fake()) {
    const requested = normalizeEmail(fakeEmail);
    const email = user ? user.email : (isValidEmail(requested) ? requested : `fake-buyer-${randomUUID().slice(0, 8)}@spanishnow.test`);
    const sessionId = `fake_${randomUUID().replace(/-/g, '')}`;
    const order = await Order.create({ ...base, email, userId: user ? user.id : null, provider: 'fake', providerSessionId: sessionId });
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
      metadata: { courseId: String(course.id), ...(user ? { userId: String(user.id) } : {}) },
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

/** Applies a verified event. Replays are harmless: fulfillOrder only acts once per order. */
async function handleStripeEvent(event) {
  if (!FULFIL_EVENTS.has(event.type)) return { handled: false };
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
  const result = await fulfillOrder(order, {
    email: details.email || session.customer_email,
    name: details.name,
    paymentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id
  });
  return { handled: true, alreadyPaid: result.alreadyPaid };
}

module.exports = { createCheckout, verifyStripeEvent, handleStripeEvent, PaymentError };
