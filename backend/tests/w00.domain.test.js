// Pure W00 rules (no database): money (PACK-01), policy (SPEC §4) and state machines (PACK-14, AGENDA-01).
const { allocate, prorate, assertMoney, assertSameCurrency } = require('../src/domain/money');
const { DEFAULT_POLICY_V1, validatePolicy, validityHoursFor } = require('../src/domain/classPolicy');
const { canTransition, OFFER_TRANSITIONS, ORDER_TRANSITIONS } = require('../src/domain/classStates');

describe('money in minor units', () => {
  test('allocate splits exactly, deterministically, ties to the lower index', () => {
    expect(allocate(9000, [1, 1, 1, 1])).toEqual([2250, 2250, 2250, 2250]);
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(3000, [2, 1])).toEqual([2000, 1000]);
    for (const [total, weights] of [[1, [1, 1, 1]], [9999, [3, 7, 11]], [0, [1, 2]], [101, [1, 0, 1]]]) {
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every(part => Number.isInteger(part) && part >= 0)).toBe(true);
    }
  });

  test('prorated refunds never exceed what was paid and refunding everything returns it all', () => {
    for (const [paid, units] of [[9000, 4], [1000, 3], [2500, 1], [1, 4]]) {
      for (let unused = 0; unused <= units; unused += 1) {
        const refund = prorate(paid, units, unused);
        expect(refund).toBeGreaterThanOrEqual(0);
        expect(refund).toBeLessThanOrEqual(paid);
        // Monotonic: more unused units never give less money back.
        if (unused) expect(refund).toBeGreaterThanOrEqual(prorate(paid, units, unused - 1));
      }
      expect(prorate(paid, units, units)).toBe(paid);
      expect(prorate(paid, units, 0)).toBe(0);
    }
    expect(prorate(9000, 4, 3)).toBe(6750);
    expect(() => prorate(9000, 4, 5)).toThrow(RangeError);
  });

  test('amounts are integers with an uppercase ISO currency and are never combined across currencies', () => {
    expect(() => assertMoney({ amount: 1500, currency: 'USD' })).not.toThrow();
    expect(() => assertMoney({ amount: 15.5, currency: 'USD' })).toThrow(RangeError);
    expect(() => assertMoney({ amount: 1500, currency: 'usd' })).toThrow(RangeError);
    expect(() => assertSameCurrency({ currency: 'USD' }, { currency: 'USD' })).not.toThrow();
    expect(() => assertSameCurrency({ currency: 'USD' }, { currency: 'ARS' })).toThrow(/currencies/);
  });
});

describe('commercial policy v1', () => {
  test('the initial values of SPEC §4 are valid, in explicit hours and minutes', () => {
    expect(validatePolicy(DEFAULT_POLICY_V1)).toEqual([]);
    expect(validityHoursFor(DEFAULT_POLICY_V1, 1)).toBe(720);
    expect(validityHoursFor(DEFAULT_POLICY_V1, 4)).toBe(90 * 24);
    expect(validityHoursFor(DEFAULT_POLICY_V1, 3)).toBeNull();
  });

  test('typos, negative values and missing rules are reported', () => {
    expect(validatePolicy({ ...DEFAULT_POLICY_V1, freeCancelHour: 24 })).toContain('unknown key freeCancelHour');
    expect(validatePolicy({ ...DEFAULT_POLICY_V1, freeCancelHours: -1 })).toContain('freeCancelHours must be a non-negative integer');
    expect(validatePolicy({ ...DEFAULT_POLICY_V1, remindersBeforeStartMinutes: [60, 60] }).length).toBe(1);
    expect(validatePolicy({ ...DEFAULT_POLICY_V1, validityHoursBySessions: { 4: 0 } }).length).toBe(1);
    expect(validatePolicy(null)).toEqual(['rules must be an object']);
  });
});

describe('state machines', () => {
  test('offers: sent offers are frozen, terminal states stay terminal', () => {
    expect(canTransition('offer', 'sent', 'checkout_pending')).toBe(true);
    expect(canTransition('offer', 'checkout_pending', 'sent')).toBe(true);
    expect(canTransition('offer', 'paid', 'cancelled')).toBe(false);
    for (const terminal of ['paid', 'expired', 'cancelled', 'replaced']) expect(OFFER_TRANSITIONS[terminal]).toEqual([]);
  });

  test('orders: a late payment is reviewed, a refund is never undone (PACK-16/17)', () => {
    expect(canTransition('order', 'failed', 'paid_needs_review')).toBe(true);
    expect(canTransition('order', 'failed', 'paid')).toBe(false);
    expect(canTransition('order', 'refunded', 'paid')).toBe(false);
    expect(ORDER_TRANSITIONS.refunded).toEqual([]);
  });

  test('sessions and proposals follow AGENDA-01', () => {
    expect(canTransition('session', 'draft', 'forming')).toBe(true);
    expect(canTransition('session', 'proposed', 'confirmed')).toBe(true);
    expect(canTransition('session', 'confirmed', 'proposed')).toBe(false); // a reschedule keeps the session confirmed
    expect(canTransition('proposal', 'pending', 'superseded')).toBe(true);
    expect(canTransition('proposal', 'accepted', 'declined')).toBe(false);
    expect(canTransition('nope', 'a', 'b')).toBe(false);
  });
});
