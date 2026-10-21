// Sales reports for a teacher: summary (aggregated in SQL), order list, and CSV export. Money is integer cents, never mixed across currencies.
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { Order, Course, User, Coupon, Affiliate } = require('../models');

const PAID_STATUSES = ['paid', 'refunded'];
const FILTER_STATUSES = ['paid', 'refunded', 'pending', 'failed', 'partially_refunded'];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const EXPORT_BATCH = 1000;

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

/** A date-only value ("2026-03-31") is a whole day in UTC: the start of it for `from`, the end of it for `to`. */
function parseDate(value, endOfDay) {
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Period of the summary. Default: from the first day of the month 11 months ago (12 calendar months) until the end of today (UTC). Returns { from, to } or { error }. */
function parseRange(query = {}, now = new Date()) {
  const blank = value => value === undefined || value === null || String(value).trim() === '';
  const to = blank(query.to) ? parseDate(now.toISOString().slice(0, 10), true) : parseDate(query.to, true);
  const from = blank(query.from) ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)) : parseDate(query.from, false);
  if (!from) return { error: 'from must be a date (YYYY-MM-DD)' };
  if (!to) return { error: 'to must be a date (YYYY-MM-DD)' };
  if (from > to) return { error: 'from must not be after to' };
  return { from, to };
}

/**
 * Sales summary of the teacher's courses. Counts orders paid or refunded (pending and failed never count), by payment date.
 * The database does the grouping: nothing but the aggregated rows travels to Node.
 *   gross = charged, refunds = returned, net = gross - refunds
 */
async function summary(teacherId, { from, to }) {
  const run = sql => sequelize.query(sql, { replacements: { teacherId, from, to }, type: QueryTypes.SELECT });
  const scope = `FROM orders o JOIN courses c ON c.id = o.courseId
    WHERE c.teacherId = :teacherId AND o.status IN ('paid', 'refunded') AND o.paidAt >= :from AND o.paidAt <= :to`;
  const [totals, byMonth, byCourse] = await Promise.all([
    run(`SELECT o.currency AS currency, SUM(o.amount) AS gross, SUM(o.refundedAmount) AS refunds, COUNT(*) AS orders,
           SUM(o.status = 'refunded' OR o.refundedAmount > 0) AS refundsCount
         ${scope} GROUP BY o.currency ORDER BY o.currency`),
    run(`SELECT DATE_FORMAT(o.paidAt, '%Y-%m') AS month, o.currency AS currency, SUM(o.amount - o.refundedAmount) AS net, COUNT(*) AS orders
         ${scope} GROUP BY DATE_FORMAT(o.paidAt, '%Y-%m'), o.currency ORDER BY month, o.currency`),
    run(`SELECT c.id AS courseId, c.title AS title, o.currency AS currency, SUM(o.amount - o.refundedAmount) AS net, COUNT(*) AS orders
         ${scope} GROUP BY c.id, c.title, o.currency ORDER BY net DESC, c.id, o.currency`)
  ]);
  return {
    totals: totals.map(row => {
      const gross = Number(row.gross);
      const refunds = Number(row.refunds);
      return { currency: row.currency, gross, refunds, net: gross - refunds, orders: Number(row.orders), refundsCount: Number(row.refundsCount) };
    }),
    byMonth: byMonth.map(row => ({ month: row.month, currency: row.currency, net: Number(row.net), orders: Number(row.orders) })),
    byCourse: byCourse.map(row => ({ courseId: row.courseId, title: row.title, currency: row.currency, net: Number(row.net), orders: Number(row.orders) }))
  };
}

const escapeLike = text => text.replace(/[\\%_]/g, match => `\\${match}`);

/**
 * Filters of the order list (status, courseId, q) as a Sequelize where plus its includes. Always restricted to the
 * teacher's courses (and, with `affiliateId`, to the orders attributed to that affiliate).
 * Returns { where, include } or { error }. Without `status`, pending and failed checkouts are left out.
 */
function filtersFrom(teacherId, query = {}, { affiliateId } = {}) {
  const and = [];
  if (affiliateId) and.push({ affiliateId });
  if (query.status !== undefined && String(query.status) !== '') {
    const status = String(query.status);
    if (!FILTER_STATUSES.includes(status)) return { error: `status must be one of ${FILTER_STATUSES.join(', ')}` };
    if (status === 'partially_refunded') and.push({ status: 'paid', refundedAmount: { [Op.gt]: 0 } });
    else and.push({ status });
  } else {
    and.push({ status: { [Op.in]: PAID_STATUSES } });
  }
  if (query.courseId !== undefined && String(query.courseId) !== '') {
    if (!validId(query.courseId)) return { error: 'courseId is not valid' };
    and.push({ courseId: Number(query.courseId) });
  }
  const q = query.q === undefined ? '' : String(query.q).trim().slice(0, 100);
  if (q) {
    const like = { [Op.like]: `%${escapeLike(q)}%` };
    and.push({ [Op.or]: [{ email: like }, { '$user.name$': like }, { '$user.email$': like }] });
  }
  return {
    where: { [Op.and]: and },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title'], where: { teacherId }, required: true },
      { model: User, as: 'user', attributes: ['id', 'name', 'email'], required: false },
      { model: Coupon, as: 'coupon', attributes: ['code'], required: false },
      { model: Affiliate, as: 'affiliate', attributes: ['id', 'name', 'code'], required: false }
    ]
  };
}

function pageFrom(query = {}) {
  const number = (value, fallback) => (value !== undefined && /^\d{1,9}$/.test(String(value)) && Number(value) >= 1 ? Number(value) : fallback);
  return { page: number(query.page, 1), pageSize: Math.min(number(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE) };
}

/** Order as the teacher sees it. Orders that predate coupons have no originalAmount: the price paid stands in for it. */
const present = order => ({
  id: order.id,
  createdAt: order.createdAt,
  paidAt: order.paidAt,
  course: { id: order.course.id, title: order.course.title },
  buyer: { id: order.user ? order.user.id : null, name: order.user ? order.user.name : null, email: order.user ? order.user.email : order.email },
  amount: order.amount,
  originalAmount: order.originalAmount != null ? order.originalAmount : order.amount,
  discountAmount: order.discountAmount,
  currency: order.currency,
  status: order.status,
  refundedAmount: order.refundedAmount,
  coupon: order.coupon ? { code: order.coupon.code } : null,
  provider: order.provider,
  receiptUrl: order.receiptUrl,
  affiliate: order.affiliate ? { id: order.affiliate.id, name: order.affiliate.name, code: order.affiliate.code } : null,
  commissionAmount: order.commissionAmount,
  commissionStatus: order.commissionStatus
});

/** { rows, total } for one page. Newest first. */
async function listOrders(teacherId, query, scope = {}) {
  const filters = filtersFrom(teacherId, query, scope);
  if (filters.error) return { error: filters.error };
  const { page, pageSize } = pageFrom(query);
  const { rows, count } = await Order.findAndCountAll({
    where: filters.where, include: filters.include, distinct: true, subQuery: false,
    order: [['id', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize
  });
  return { rows: rows.map(present), total: count };
}

/** Calls `onBatch(rows)` with every order matching the filters (newest first), loading EXPORT_BATCH at a time. */
async function eachOrderBatch(teacherId, query, onBatch) {
  const filters = filtersFrom(teacherId, query);
  if (filters.error) return { error: filters.error };
  let lastId = null;
  for (;;) {
    const rows = await Order.findAll({
      where: { [Op.and]: [filters.where, ...(lastId ? [{ id: { [Op.lt]: lastId } }] : [])] },
      include: filters.include, order: [['id', 'DESC']], limit: EXPORT_BATCH, subQuery: false
    });
    if (!rows.length) return {};
    await onBatch(rows.map(present));
    lastId = rows[rows.length - 1].id;
    if (rows.length < EXPORT_BATCH) return {};
  }
}

// ---- CSV -------------------------------------------------------------------------------------------------------

const CSV_HEADERS = ['ID', 'Fecha', 'Fecha de pago', 'Curso', 'Comprador', 'Email', 'Monto original', 'Descuento', 'Monto pagado', 'Moneda',
  'Estado', 'Reembolsado', 'Cupón', 'Medio de pago', 'Recibo', 'Afiliado', 'Comisión'];

const STATUS_LABELS = { paid: 'Pagada', refunded: 'Reembolsada', pending: 'Pendiente', failed: 'Fallida' };
const PROVIDER_LABELS = { stripe: 'Stripe', fake: 'Prueba', coupon: 'Cupón 100%' };

/**
 * One CSV cell. Text that a spreadsheet could read as a formula (starts with = + - @, a tab or a carriage return) gets a
 * leading apostrophe. Cells with commas, semicolons, quotes or line breaks are quoted and their quotes doubled.
 */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 1999 -> "19.99" (integer arithmetic). */
const decimal = cents => `${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
const iso = date => (date ? new Date(date).toISOString() : '');

const csvRow = cells => `${cells.map(csvCell).join(',')}\r\n`;
const csvHeader = () => csvRow(CSV_HEADERS);

function csvLine(order) {
  const status = order.status === 'paid' && order.refundedAmount > 0 ? 'Reembolso parcial' : STATUS_LABELS[order.status] || order.status;
  return csvRow([
    order.id, iso(order.createdAt), iso(order.paidAt), order.course.title, order.buyer.name, order.buyer.email,
    decimal(order.originalAmount), decimal(order.discountAmount), decimal(order.amount), String(order.currency).toUpperCase(),
    status, decimal(order.refundedAmount), order.coupon ? order.coupon.code : '', PROVIDER_LABELS[order.provider] || order.provider, order.receiptUrl,
    order.affiliate ? `${order.affiliate.name} (${order.affiliate.code})` : '', decimal(order.commissionAmount)
  ]);
}

module.exports = { parseRange, summary, listOrders, eachOrderBatch, present, csvHeader, csvLine, csvCell, decimal, filtersFrom, validId };
