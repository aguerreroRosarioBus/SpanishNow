// Fixed-window counters in rate_limit_buckets (CHAT-07): they live in MySQL, so every replica shares them.
// hit() is meant to run inside the business transaction: when the action is refused or fails the transaction rolls
// back and the hit is not counted, and the row lock serializes concurrent hits on the same bucket.
const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../config/database');
const { RateLimitBucket } = require('../models');

class RateLimitError extends Error {
  constructor(retryAt, params = {}) {
    super('Demasiados intentos; probá de nuevo más tarde');
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.code = 'rate_limited';
    this.retryAt = retryAt;
    this.params = { retryAt: retryAt.toISOString(), ...params };
  }

  get status() { return this.statusCode; }
}

const windowStartOf = (now, windowMs) => new Date(Math.floor(now.getTime() / windowMs) * windowMs);

// Raw query replacements format a Date in the process's local zone, not in the connection's '+00:00': pass UTC text.
const utc = date => date.toISOString().slice(0, 23).replace('T', ' ');

/**
 * Counts one hit in `bucketKey` for the window of `windowMs` that contains `now` and throws RateLimitError (429 with
 * the end of the window as retryAt) when it goes over `limit`. Several limits are checked by calling it once each.
 */
async function hit({ bucketKey, windowMs, limit, now = new Date(), scope = null }, { transaction }) {
  if (!transaction) throw new Error('rateLimit.hit needs the business transaction');
  const windowStart = windowStartOf(now, windowMs);
  await sequelize.query(
    `INSERT INTO rate_limit_buckets (bucketKey, windowStart, hits, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE hits = hits + 1, updatedAt = VALUES(updatedAt)`,
    { replacements: [bucketKey, utc(windowStart), utc(now), utc(now)], transaction }
  );
  const [row] = await sequelize.query(
    'SELECT hits FROM rate_limit_buckets WHERE bucketKey = ? AND windowStart = ?',
    { replacements: [bucketKey, utc(windowStart)], type: QueryTypes.SELECT, transaction }
  );
  if (row.hits > limit) throw new RateLimitError(new Date(windowStart.getTime() + windowMs), { limit, ...(scope ? { scope } : {}) });
}

/** Deletes windows that ended before `before` (counters are only useful while their window is open). */
const prune = (before = new Date(Date.now() - 2 * 24 * 3600e3)) => RateLimitBucket.destroy({ where: { windowStart: { [Op.lt]: before } } });

/** Express helper: answers a RateLimitError with Retry-After. Returns false for any other error. */
function sendRateLimited(res, error) {
  if (!(error instanceof RateLimitError)) return false;
  res.set('Retry-After', String(Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1000))));
  res.status(429).json({ error: error.message, code: error.code, params: error.params });
  return true;
}

module.exports = { hit, prune, windowStartOf, utc, RateLimitError, sendRateLimited };
