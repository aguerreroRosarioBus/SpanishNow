// Courses sold on Hotmart: the checkout link "Buy now" opens, and the purchase webhook (version 2.0.0) that gives access.
// Hotmart charges the buyer; SpanishNow only learns about the purchase here and fulfils it like any other order.
const { timingSafeEqual } = require('crypto');
const { Op } = require('sequelize');
const { Course, Order } = require('../models');
const { fulfillOrder, registerRefund } = require('./orderService');
const { normalizeEmail, isValidEmail } = require('./accounts');
const { PaymentError } = require('./paymentService');

const FULFIL_EVENTS = new Set(['PURCHASE_APPROVED', 'PURCHASE_COMPLETE']);
const REFUND_EVENTS = new Set(['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK']);
const CHECKOUT_HOSTS = new Set(['pay.hotmart.com', 'go.hotmart.com']);
const PRODUCT_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

const isHotmartCourse = course => Boolean(course && course.hotmartCheckoutUrl);

/** Course fields of a PUT body: { values } or { error, status? }. '' or null clears a field. */
async function parseCourseFields(body, course) {
  const has = key => body[key] !== undefined;
  if (!has('hotmartProductId') && !has('hotmartCheckoutUrl')) return { values: {} };
  const values = {};
  const text = key => (body[key] === null ? '' : String(body[key]).trim());

  if (has('hotmartProductId')) {
    const id = text('hotmartProductId');
    if (id && !PRODUCT_PATTERN.test(id)) return { error: 'hotmartProductId must be the Hotmart product id (letters, numbers and hyphens)' };
    if (id) {
      const other = await Course.findOne({ where: { hotmartProductId: id, id: { [Op.ne]: course.id } }, attributes: ['id'] });
      if (other) return { status: 409, error: 'Another course already uses this Hotmart product' };
      const packageVersion = await require('../models').ClassPackageTemplateVersion.findOne({ where: { hotmartProductId: id }, attributes: ['id'] });
      if (packageVersion) return { status: 409, error: 'Este producto Hotmart ya pertenece a un paquete de clases' };
    }
    values.hotmartProductId = id || null;
  }
  if (has('hotmartCheckoutUrl')) {
    const raw = text('hotmartCheckoutUrl');
    if (raw) {
      let url;
      try { url = new URL(raw); } catch (error) { url = null; }
      if (!url || url.protocol !== 'https:' || !CHECKOUT_HOSTS.has(url.hostname) || raw.length > 500) {
        return { error: 'hotmartCheckoutUrl must be a Hotmart checkout link (https://pay.hotmart.com/...)' };
      }
    }
    values.hotmartCheckoutUrl = raw || null;
  }
  const productId = has('hotmartProductId') ? values.hotmartProductId : course.hotmartProductId;
  const checkoutUrl = has('hotmartCheckoutUrl') ? values.hotmartCheckoutUrl : course.hotmartCheckoutUrl;
  if (checkoutUrl && !productId) return { error: 'Set the Hotmart product id too: the webhook needs it to find the course' };
  return { values };
}

/** Hotmart checkout link of a course, with the logged-in buyer's email and name prefilled. */
function checkoutUrlFor(course, user) {
  const url = new URL(course.hotmartCheckoutUrl);
  if (user) {
    url.searchParams.set('email', user.email);
    if (user.name) url.searchParams.set('name', user.name);
  }
  return url.toString();
}

/** URL to paste in Hotmart. PUBLIC_API_URL (e.g. https://api.example.com) wins; otherwise the host the request came to. */
function webhookUrl(req) {
  const configuredBase = (process.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${configuredBase || `${proto}://${req.get('host')}`}/api/payments/hotmart/webhook`;
}
const configured = () => Boolean(process.env.HOTMART_HOTTOK);

/** Compares the hottok Hotmart sent (header in 2.0.0, body field in older versions) with ours. Throws PaymentError. */
function verifyHottok(headerToken, body) {
  const secret = process.env.HOTMART_HOTTOK;
  if (!secret) throw new PaymentError(503, 'Webhook is not configured');
  const sent = String(headerToken || (body && body.hottok) || '');
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PaymentError(401, 'Invalid hottok');
}

/** Price paid in cents and its currency, from data.purchase.price (falls back to the course price). */
function priceOf(purchase, course) {
  const price = (purchase && (purchase.price || purchase.full_price)) || {};
  const value = Number(price.value);
  const currency = String(price.currency_value || '').trim().toLowerCase();
  if (Number.isFinite(value) && value >= 0 && /^[a-z]{3}$/.test(currency)) return { amount: Math.round(value * 100), currency };
  return { amount: course.price, currency: String(course.currency).toLowerCase() };
}

async function courseOf(product) {
  const keys = [product && product.id, product && product.ucode].filter(value => value !== undefined && value !== null && value !== '').map(String);
  if (!keys.length) return null;
  return Course.findOne({ where: { hotmartProductId: keys } });
}

/** The order of a Hotmart transaction, created on first sight (the transaction code is the idempotency key). */
async function orderFor(course, purchase, buyer, status) {
  const transaction = String(purchase.transaction);
  const sessionId = `hotmart_${transaction}`.slice(0, 255);
  const existing = await Order.findOne({ where: { providerSessionId: sessionId } });
  if (existing) return existing;
  const { amount, currency } = priceOf(purchase, course);
  const email = normalizeEmail(buyer && buyer.email);
  try {
    return await Order.create({
      courseId: course.id, email: isValidEmail(email) ? email : null, amount, currency, originalAmount: amount,
      provider: 'hotmart', providerSessionId: sessionId, providerPaymentId: transaction.slice(0, 255),
      status, ...(status === 'refunded' ? { refundedAmount: amount, refundedAt: new Date() } : {})
    });
  } catch (error) {
    // Two deliveries of the same transaction at once: the other one created it.
    if (error.name === 'SequelizeUniqueConstraintError') return Order.findOne({ where: { providerSessionId: sessionId } });
    throw error;
  }
}

/**
 * Applies a verified webhook body. Never throws for events or products SpanishNow does not handle: Hotmart turns the
 * webhook off when it gets errors. Returns { handled, reason? }.
 */
async function handleEvent(body) {
  const event = body && body.event;
  const data = (body && body.data) || {};
  const purchase = data.purchase || {};
  if (!FULFIL_EVENTS.has(event) && !REFUND_EVENTS.has(event)) return { handled: false, reason: 'event' };
  if (!purchase.transaction) return { handled: false, reason: 'no_transaction' };

  const course = await courseOf(data.product);
  if (!course) {
    console.warn(`Hotmart ${event} for unknown product ${data.product && data.product.id}; ignored`);
    return { handled: false, reason: 'unknown_product' };
  }

  if (FULFIL_EVENTS.has(event)) {
    const buyer = data.buyer || {};
    const email = normalizeEmail(buyer.email);
    if (!isValidEmail(email)) {
      console.warn(`Hotmart ${purchase.transaction} has no valid buyer email; ignored`);
      return { handled: false, reason: 'no_email' };
    }
    const order = await orderFor(course, purchase, buyer, 'pending');
    const result = await fulfillOrder(order, { email, name: buyer.name, paymentId: String(purchase.transaction) });
    return { handled: true, alreadyPaid: result.alreadyPaid };
  }

  // Refund or chargeback. Seen before the approval: the order is stored as refunded so a late approval gives no access.
  const order = await orderFor(course, purchase, data.buyer, 'refunded');
  const result = await registerRefund(order.id, { full: true, revokeAccess: true });
  if (result.reason === 'not_paid') {
    // Approved delivery that never got fulfilled (still pending): close it so a retry of the approval gives no access.
    await order.update({ status: 'refunded', refundedAmount: order.amount, refundedAt: new Date() });
    return { handled: true, applied: true };
  }
  return { handled: true, applied: result.applied };
}

module.exports = { isHotmartCourse, parseCourseFields, checkoutUrlFor, verifyHottok, handleEvent, webhookUrl, configured };
