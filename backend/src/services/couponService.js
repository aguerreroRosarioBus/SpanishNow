// Coupons: price calculation (always in integer cents), eligibility checks and validation of what a teacher submits.
const { Coupon } = require('../models');

// Stripe refuses a charge below this amount (50 cents in USD/EUR). A final price between 1 and MIN_CHARGE - 1 cannot be charged.
const MIN_CHARGE = 50;
const MAX_AMOUNT = 99999999; // same ceiling as a course price
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/; // 3-40 characters, no leading or trailing hyphen

class CouponError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeCode = value => String(value ?? '').trim().toUpperCase();

/** Discount in cents for a price in cents. Percentages round the discount DOWN; the result is within [0, price]. */
function discountFor(coupon, price) {
  if (coupon.percentOff != null) return Math.min(price, Math.floor((price * coupon.percentOff) / 100));
  return Math.min(price, Math.max(0, coupon.amountOff));
}

const isExpired = (coupon, now = new Date()) => Boolean(coupon.expiresAt) && new Date(coupon.expiresAt).getTime() <= now.getTime();
const isExhausted = coupon => coupon.maxRedemptions != null && coupon.redemptions >= coupon.maxRedemptions;

/**
 * Applies `coupon` to `course`. Returns { originalAmount, discountAmount, amount, currency } or throws CouponError.
 * A coupon of another teacher is reported as invalid (the caller learns nothing about other teachers' codes).
 */
function applyToCourse(coupon, course, now = new Date()) {
  if (!coupon || !coupon.active || coupon.teacherId !== course.teacherId) throw new CouponError('coupon_invalid', 'This coupon code is not valid');
  if (isExpired(coupon, now)) throw new CouponError('coupon_expired', 'This coupon has expired');
  if (isExhausted(coupon)) throw new CouponError('coupon_exhausted', 'This coupon has no uses left');
  if (coupon.courseId != null && coupon.courseId !== course.id) throw new CouponError('coupon_not_applicable', 'This coupon does not apply to this course');
  const currency = String(course.currency).toLowerCase();
  if (coupon.amountOff != null && String(coupon.currency).toLowerCase() !== currency) {
    throw new CouponError('coupon_not_applicable', 'This coupon is in a different currency than the course');
  }
  const originalAmount = course.price;
  const discountAmount = discountFor(coupon, originalAmount);
  const amount = originalAmount - discountAmount;
  if (amount > 0 && amount < MIN_CHARGE) {
    throw new CouponError('coupon_not_applicable', 'With this coupon the price would be below the minimum that can be charged');
  }
  return { originalAmount, discountAmount, amount, currency };
}

/**
 * Price of `course` for a buyer who may carry a coupon code.
 * Returns { originalAmount, discountAmount, amount, currency, coupon } (coupon is the model row, or null without code).
 */
async function priceFor(course, couponCode, { now = new Date() } = {}) {
  const currency = String(course.currency).toLowerCase();
  const code = normalizeCode(couponCode);
  if (!code) return { originalAmount: course.price, discountAmount: 0, amount: course.price, currency, coupon: null };
  const coupon = await Coupon.findOne({ where: { code } });
  if (!coupon) throw new CouponError('coupon_invalid', 'This coupon code is not valid');
  return { ...applyToCourse(coupon, course, now), coupon };
}

/** Response shape of POST /checkout/quote. */
const quoteShape = pricing => ({
  originalAmount: pricing.originalAmount,
  discountAmount: pricing.discountAmount,
  amount: pricing.amount,
  currency: pricing.currency,
  coupon: pricing.coupon ? { code: pricing.coupon.code, percentOff: pricing.coupon.percentOff, amountOff: pricing.coupon.amountOff } : null
});

/** Coupon as the teacher sees it. `course` is the loaded Course (or null/undefined for "all courses"). */
const present = (coupon, course) => ({
  id: coupon.id,
  code: coupon.code,
  percentOff: coupon.percentOff,
  amountOff: coupon.amountOff,
  currency: coupon.currency,
  courseId: coupon.courseId,
  course: course ? { id: course.id, title: course.title } : null,
  maxRedemptions: coupon.maxRedemptions,
  redemptions: coupon.redemptions,
  expiresAt: coupon.expiresAt,
  active: coupon.active,
  createdAt: coupon.createdAt
});

const isWholeNumber = value => (typeof value === 'number' ? Number.isInteger(value) : /^-?\d+$/.test(String(value).trim()));
const toNumber = value => (typeof value === 'number' ? value : Number(String(value).trim()));
const isBlank = value => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** null for blank; a date-only value ("2026-12-31") means the end of that day (UTC); otherwise any ISO timestamp. Returns { value } or { error }. */
function parseExpiresAt(value) {
  if (isBlank(value)) return { value: null };
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T23:59:59.999Z`) : new Date(text);
  if (Number.isNaN(date.getTime())) return { error: 'expiresAt must be a date' };
  return { value: date };
}

/**
 * Reads the body of POST/PUT /teacher/coupons. `current` is the stored coupon when updating (fields not sent keep their value).
 * Returns { values } (full set of editable columns) or { error }. Ownership of courseId is checked by the caller.
 */
function parseInput(body = {}, current = null) {
  const has = key => body[key] !== undefined;
  const base = current ? {
    code: current.code, percentOff: current.percentOff, amountOff: current.amountOff, currency: current.currency, courseId: current.courseId,
    maxRedemptions: current.maxRedemptions, expiresAt: current.expiresAt, active: current.active
  } : { code: undefined, percentOff: null, amountOff: null, currency: null, courseId: null, maxRedemptions: null, expiresAt: null, active: true };
  const values = { ...base };

  if (has('code')) {
    values.code = normalizeCode(body.code);
    if (!CODE_PATTERN.test(values.code)) return { error: 'code must have 3 to 40 characters: letters, numbers and hyphens' };
  } else if (!current) {
    return { error: 'code is required' };
  }

  // Discount: exactly one of percentOff / amountOff. Sending one of them replaces the other.
  const sendsPercent = has('percentOff') && !isBlank(body.percentOff);
  const sendsAmount = has('amountOff') && !isBlank(body.amountOff);
  if (sendsPercent && sendsAmount) return { error: 'Use either percentOff or amountOff, not both' };
  if (sendsPercent) {
    if (!isWholeNumber(body.percentOff) || toNumber(body.percentOff) < 1 || toNumber(body.percentOff) > 100) return { error: 'percentOff must be a whole number between 1 and 100' };
    values.percentOff = toNumber(body.percentOff);
    values.amountOff = null;
    values.currency = null;
  } else if (sendsAmount) {
    if (!isWholeNumber(body.amountOff) || toNumber(body.amountOff) < 1 || toNumber(body.amountOff) > MAX_AMOUNT) return { error: `amountOff must be a whole number of cents between 1 and ${MAX_AMOUNT}` };
    values.amountOff = toNumber(body.amountOff);
    values.percentOff = null;
  }
  if (values.amountOff != null) {
    if (has('currency') && !isBlank(body.currency)) {
      const currency = String(body.currency).trim().toLowerCase();
      if (!/^[a-z]{3}$/.test(currency)) return { error: 'currency must be a 3-letter code such as usd' };
      values.currency = currency;
    }
    if (!values.currency) return { error: 'currency is required with amountOff' };
  }
  if (values.percentOff == null && values.amountOff == null) return { error: 'percentOff or amountOff is required' };

  if (has('courseId')) {
    if (isBlank(body.courseId)) values.courseId = null;
    else if (!isWholeNumber(body.courseId) || toNumber(body.courseId) < 1 || toNumber(body.courseId) > 2147483647) return { error: 'courseId is not valid' };
    else values.courseId = toNumber(body.courseId);
  }
  if (has('maxRedemptions')) {
    if (isBlank(body.maxRedemptions)) values.maxRedemptions = null;
    else if (!isWholeNumber(body.maxRedemptions) || toNumber(body.maxRedemptions) < 1 || toNumber(body.maxRedemptions) > 1000000) return { error: 'maxRedemptions must be a whole number of at least 1' };
    else values.maxRedemptions = toNumber(body.maxRedemptions);
  }
  if (has('expiresAt')) {
    const parsed = parseExpiresAt(body.expiresAt);
    if (parsed.error) return { error: parsed.error };
    values.expiresAt = parsed.value;
  }
  if (has('active')) {
    const raw = body.active;
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') values.active = true;
    else if (raw === false || raw === 'false' || raw === 0 || raw === '0') values.active = false;
    else return { error: 'active must be true or false' };
  }
  return { values };
}

module.exports = {
  MIN_CHARGE, CouponError, normalizeCode, discountFor, applyToCourse, priceFor, quoteShape, present, parseInput, isExpired, isExhausted
};
