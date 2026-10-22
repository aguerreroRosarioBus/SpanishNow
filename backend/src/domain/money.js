// Money in integer minor units with an explicit ISO 4217 currency (PACK-01, CONTRATO.md §1.1).

const CURRENCY = /^[A-Z]{3}$/;

function assertMoney({ amount, currency }) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('amount must be a non-negative integer in minor units');
  if (!CURRENCY.test(currency)) throw new RangeError('currency must be an uppercase ISO 4217 code');
}

/** Throws unless every value has the same currency: amounts of different currencies are never combined. */
function assertSameCurrency(...values) {
  const currencies = new Set(values.map(value => value.currency));
  if (currencies.size > 1) throw new RangeError(`cannot combine currencies: ${[...currencies].join(', ')}`);
}

/**
 * Splits `total` into parts proportional to `weights` (non-negative integers, at least one positive) with the largest
 * remainder method. Deterministic: ties go to the lower index. Parts are integers >= 0 and add up to exactly `total`.
 */
function allocate(total, weights) {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('total must be a non-negative integer');
  if (!weights.length || weights.some(w => !Number.isSafeInteger(w) || w < 0)) throw new RangeError('weights must be non-negative integers');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new RangeError('at least one weight must be positive');
  const parts = weights.map(w => Math.floor((total * w) / sum));
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % sum }));
  let left = total - parts.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of remainders) {
    if (!left) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

/**
 * Refund for `unusedUnits` of `totalUnits` paid `paid` in total: the share of the last `unusedUnits` units when the price
 * is spread with allocate(). Every possible partial refund is therefore <= paid, and refunding all units returns `paid`.
 */
function prorate(paid, totalUnits, unusedUnits) {
  if (!Number.isSafeInteger(totalUnits) || totalUnits <= 0) throw new RangeError('totalUnits must be a positive integer');
  if (!Number.isSafeInteger(unusedUnits) || unusedUnits < 0 || unusedUnits > totalUnits) throw new RangeError('unusedUnits out of range');
  const shares = allocate(paid, new Array(totalUnits).fill(1));
  return shares.slice(totalUnits - unusedUnits).reduce((a, b) => a + b, 0);
}

module.exports = { assertMoney, assertSameCurrency, allocate, prorate };
