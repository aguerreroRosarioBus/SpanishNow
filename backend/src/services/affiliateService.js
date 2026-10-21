// Affiliates: input validation, code and token generation, attribution of a checkout, commission maths and per-currency stats.
// Money is integer cents, never mixed across currencies. The commission of an order is ALWAYS derived from
//   floor((amount - refundedAmount) * commissionPercent / 100)
// so applying it again (webhook replays, manual refund after the webhook) yields the same number: it is idempotent by construction.
const { randomBytes, randomInt, timingSafeEqual } = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { Affiliate, AffiliatePayout, Order, Course } = require('../models');
const { normalizeEmail, isValidEmail } = require('./accounts');
const { frontendUrl } = require('../config/payments');

const MIN_PERCENT = 1;
const MAX_PERCENT = 90;
const MAX_NOTES = 2000;
const MAX_PAYOUT = 99999999; // cents, same ceiling as a course price
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/; // 3-40 characters, no leading or trailing hyphen
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes in base64url
const PUBLIC_ORDERS_LIMIT = 500;

class AffiliateError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const normalizeCode = value => String(value ?? '').trim().toUpperCase();
const isBlank = value => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const isWhole = value => (typeof value === 'number' ? Number.isInteger(value) : /^-?\d+$/.test(String(value).trim()));
const toNumber = value => (typeof value === 'number' ? value : Number(String(value).trim()));
const cleanText = (value, max) => String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** 256 random bits as base64url (43 characters): the secret of the private dashboard link. */
const generateToken = () => randomBytes(32).toString('base64url');

/** Readable code from a name plus 4 random characters: "Ana López" -> "ANALOPEZ-K7QM". Uniqueness is checked by the caller. */
function generateCode(name) {
  const base = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'AFF';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${base}-${suffix}`;
}

/** Same comparison for any secret: constant time for equal-length strings. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Reads the body of POST/PUT /teacher/affiliates. `current` is the stored affiliate when updating (fields not sent keep their value;
 * the code can only be chosen on creation).
 * Returns { values } (editable columns; `code` only on creation, and only when sent) or { error }.
 */
function parseInput(body = {}, current = null) {
  const has = key => body[key] !== undefined;
  const values = {};

  if (has('name') || !current) {
    if (typeof body.name !== 'string' || !cleanText(body.name, 200)) return { error: 'name is required (up to 100 characters)' };
    const name = cleanText(body.name, 200);
    if (name.length > 100) return { error: 'name must have at most 100 characters' };
    values.name = name;
  }
  if (has('email') || !current) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return { error: 'email is not valid' };
    values.email = email;
  }
  if (has('commissionPercent') || !current) {
    if (isBlank(body.commissionPercent) || !isWhole(body.commissionPercent) || toNumber(body.commissionPercent) < MIN_PERCENT || toNumber(body.commissionPercent) > MAX_PERCENT) {
      return { error: `commissionPercent must be a whole number between ${MIN_PERCENT} and ${MAX_PERCENT}` };
    }
    values.commissionPercent = toNumber(body.commissionPercent);
  }
  if (has('active')) {
    const raw = body.active;
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') values.active = true;
    else if (raw === false || raw === 'false' || raw === 0 || raw === '0') values.active = false;
    else return { error: 'active must be true or false' };
  }
  if (has('notes')) {
    if (body.notes === null || (typeof body.notes === 'string' && !body.notes.trim())) values.notes = null;
    else if (typeof body.notes !== 'string' || body.notes.length > MAX_NOTES) return { error: `notes must be text of at most ${MAX_NOTES} characters` };
    else values.notes = body.notes.trim();
  }
  if (!current && has('code') && !isBlank(body.code)) {
    const code = normalizeCode(body.code);
    if (!CODE_PATTERN.test(code)) return { error: 'code must have 3 to 40 characters: letters, numbers and hyphens' };
    values.code = code;
  }
  return { values };
}

/**
 * Reads the body of POST /teacher/affiliates/:id/payouts. Returns { values: { amount, currency, paidAt, note } } or { error }.
 * `paidAt`: YYYY-MM-DD (00:00 UTC) or an ISO timestamp, not in the future (a day of tolerance for time zones).
 */
function parsePayout(body = {}, now = new Date()) {
  if (isBlank(body.amount) || !isWhole(body.amount) || toNumber(body.amount) < 1 || toNumber(body.amount) > MAX_PAYOUT) {
    return { error: `amount must be a whole number of cents between 1 and ${MAX_PAYOUT}` };
  }
  const currency = String(body.currency ?? '').trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) return { error: 'currency must be a 3-letter code such as usd' };
  let paidAt = now;
  if (!isBlank(body.paidAt)) {
    if (typeof body.paidAt === 'object') return { error: 'paidAt must be a date' };
    const text = String(body.paidAt).trim();
    paidAt = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : new Date(text);
    if (Number.isNaN(paidAt.getTime()) || paidAt.getUTCFullYear() < 2000) return { error: 'paidAt must be a date (YYYY-MM-DD or ISO)' };
    if (paidAt.getTime() > now.getTime() + 86400000) return { error: 'paidAt cannot be in the future' };
  }
  let note = null;
  if (!isBlank(body.note)) {
    if (typeof body.note !== 'string' || body.note.trim().length > 300) return { error: 'note must be text of at most 300 characters' };
    note = body.note.trim();
  }
  return { values: { amount: toNumber(body.amount), currency, paidAt, note } };
}

/**
 * The affiliate a checkout is attributed to. Anything wrong (blank, not text, unknown, inactive, another teacher's) is
 * ignored: it must never block a purchase. Returns the Affiliate row or null.
 */
async function resolveCode(rawCode, course) {
  try {
    if (typeof rawCode !== 'string') return null;
    const code = normalizeCode(rawCode);
    if (!CODE_PATTERN.test(code)) return null;
    const affiliate = await Affiliate.findOne({ where: { code } });
    if (!affiliate || !affiliate.active || affiliate.teacherId !== course.teacherId) return null;
    return affiliate;
  } catch (error) {
    console.warn('Affiliate code could not be resolved:', error.message);
    return null;
  }
}

/** Commission in cents of the money still kept: floor((amount - refunded) * percent / 100). */
const commissionFor = (amount, refundedAmount, percent) => Math.max(0, Math.floor(((amount - (refundedAmount || 0)) * percent) / 100));

/**
 * Fulfilment of an order: fixes the commission with the affiliate's percentage of today. No commission ('none') for a 100 %
 * coupon, an amount too small to give a cent, or when the buyer is the affiliate (self-referral). Runs inside fulfillOrder's transaction.
 */
async function recordCommission(order, buyerEmail, transaction) {
  if (!order.affiliateId) return;
  const affiliate = await Affiliate.findByPk(order.affiliateId, { transaction });
  if (!affiliate) return;
  if (normalizeEmail(affiliate.email) === normalizeEmail(buyerEmail)) {
    await order.update({ commissionPercent: null, commissionAmount: 0, commissionStatus: 'none' }, { transaction });
    return;
  }
  const commission = commissionFor(order.amount, order.refundedAmount, affiliate.commissionPercent);
  await order.update({
    commissionPercent: affiliate.commissionPercent, commissionAmount: commission, commissionStatus: commission > 0 ? 'pending' : 'none'
  }, { transaction });
}

/**
 * A refund was recorded (`order.refundedAmount` is already the new CUMULATIVE amount): recompute the commission from it.
 * Total refund: 0 and 'void'. Partial: floor of what the buyer kept. Same result however many times it runs.
 * Runs inside registerRefund's transaction.
 */
async function adjustForRefund(order, { total }, transaction) {
  if (!order.affiliateId || order.commissionStatus === 'none' || order.commissionPercent == null) return;
  await order.update(total
    ? { commissionAmount: 0, commissionStatus: 'void' }
    : { commissionAmount: commissionFor(order.amount, order.refundedAmount, order.commissionPercent), commissionStatus: 'pending' }, { transaction });
}

/**
 * Per-currency stats of each affiliate, aggregated by the database: Map(affiliateId -> [{ currency, orders, sales, commission, paid, owed }]).
 *   orders      paid or refunded orders that carry a commission rule (not 'none': free, self-referred)
 *   sales       what buyers kept: sum of amount - refundedAmount
 *   commission  sum of the pending commissions (void ones count 0)
 *   paid        payouts registered; owed = commission - paid (negative when overpaid)
 */
async function statsFor(affiliateIds) {
  const result = new Map(affiliateIds.map(id => [id, []]));
  if (!affiliateIds.length) return result;
  const run = (sql) => sequelize.query(sql, { replacements: { ids: affiliateIds }, type: QueryTypes.SELECT });
  const [sales, payouts] = await Promise.all([
    run(`SELECT o.affiliateId AS affiliateId, o.currency AS currency, COUNT(*) AS orders, SUM(o.amount - o.refundedAmount) AS sales,
           SUM(CASE WHEN o.commissionStatus = 'pending' THEN o.commissionAmount ELSE 0 END) AS commission
         FROM orders o WHERE o.affiliateId IN (:ids) AND o.status IN ('paid', 'refunded') AND o.commissionStatus <> 'none'
         GROUP BY o.affiliateId, o.currency`),
    run('SELECT p.affiliateId AS affiliateId, p.currency AS currency, SUM(p.amount) AS paid FROM affiliate_payouts p WHERE p.affiliateId IN (:ids) GROUP BY p.affiliateId, p.currency')
  ]);
  const rows = new Map(); // `${affiliateId}:${currency}` -> row
  const rowFor = (affiliateId, currency) => {
    const key = `${affiliateId}:${currency}`;
    if (!rows.has(key)) {
      const row = { currency, orders: 0, sales: 0, commission: 0, paid: 0, owed: 0 };
      rows.set(key, row);
      result.get(affiliateId).push(row);
    }
    return rows.get(key);
  };
  for (const r of sales) Object.assign(rowFor(r.affiliateId, r.currency), { orders: Number(r.orders), sales: Number(r.sales), commission: Number(r.commission) });
  for (const r of payouts) rowFor(r.affiliateId, r.currency).paid = Number(r.paid);
  for (const list of result.values()) {
    for (const row of list) row.owed = row.commission - row.paid;
    list.sort((a, b) => a.currency.localeCompare(b.currency));
  }
  return result;
}

/** Affiliate as the teacher sees it. `stats` comes from statsFor. */
const present = (affiliate, stats = []) => ({
  id: affiliate.id,
  name: affiliate.name,
  email: affiliate.email,
  code: affiliate.code,
  commissionPercent: affiliate.commissionPercent,
  dashboardToken: affiliate.dashboardToken,
  active: affiliate.active,
  notes: affiliate.notes,
  createdAt: affiliate.createdAt,
  stats
});

const presentPayout = payout => ({ id: payout.id, amount: payout.amount, currency: payout.currency, paidAt: payout.paidAt, note: payout.note, createdAt: payout.createdAt });

/** Finds the affiliate of a private dashboard link; null for an unknown token or an inactive affiliate. */
async function findByToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const affiliate = await Affiliate.findOne({ where: { dashboardToken: token } });
  if (!affiliate || !affiliate.active || !safeEqual(affiliate.dashboardToken, token)) return null;
  return affiliate;
}

/**
 * What the affiliate sees on the private page: never an email, name or any other data of a buyer.
 * { affiliate: { name, code, commissionPercent }, links, stats, orders, payouts }
 */
async function dashboardFor(affiliate) {
  const [courses, stats, orders, payouts] = await Promise.all([
    Course.findAll({ where: { teacherId: affiliate.teacherId, isPublished: true }, attributes: ['title', 'slug'], order: [['title', 'ASC'], ['id', 'ASC']] }),
    statsFor([affiliate.id]),
    Order.findAll({
      where: { affiliateId: affiliate.id, status: ['paid', 'refunded'], commissionStatus: ['pending', 'void'] },
      attributes: ['paidAt', 'amount', 'currency', 'commissionAmount', 'commissionStatus'],
      include: [{ model: Course, as: 'course', attributes: ['title'] }],
      order: [['paidAt', 'DESC'], ['id', 'DESC']], limit: PUBLIC_ORDERS_LIMIT
    }),
    AffiliatePayout.findAll({ where: { affiliateId: affiliate.id }, order: [['paidAt', 'DESC'], ['id', 'DESC']] })
  ]);
  const base = frontendUrl();
  return {
    affiliate: { name: affiliate.name, code: affiliate.code, commissionPercent: affiliate.commissionPercent },
    links: courses.filter(course => course.slug).map(course => ({ courseTitle: course.title, url: `${base}/courses/${course.slug}?ref=${encodeURIComponent(affiliate.code)}` })),
    stats: stats.get(affiliate.id),
    orders: orders.map(order => ({
      paidAt: order.paidAt, courseTitle: order.course ? order.course.title : null, amount: order.amount, currency: order.currency,
      commissionAmount: order.commissionAmount, commissionStatus: order.commissionStatus
    })),
    payouts: payouts.map(payout => ({ amount: payout.amount, currency: payout.currency, paidAt: payout.paidAt, note: payout.note }))
  };
}

module.exports = {
  AffiliateError, CODE_PATTERN, TOKEN_PATTERN, MAX_PERCENT, normalizeCode, generateToken, generateCode, safeEqual, parseInput, parsePayout,
  resolveCode, commissionFor, recordCommission, adjustForRefund, statsFor, present, presentPayout, findByToken, dashboardFor
};
