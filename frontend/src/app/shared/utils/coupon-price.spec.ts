import { applyDiscount, couponErrorMessage, normalizeCouponCode, priceView } from './coupon-price';

describe('applyDiscount', () => {
  it('aplica un porcentaje', () => {
    expect(applyDiscount(10000, 'usd', { percentOff: 25, amountOff: null })).toEqual({ originalAmount: 10000, discountAmount: 2500, amount: 7500 });
  });
  it('100 % deja el precio en 0', () => {
    expect(applyDiscount(4900, 'usd', { percentOff: 100, amountOff: null })?.amount).toBe(0);
  });
  it('aplica un monto fijo en la misma moneda', () => {
    expect(applyDiscount(4900, 'usd', { percentOff: null, amountOff: 1000, currency: 'USD' })?.amount).toBe(3900);
  });
  it('nunca baja de 0', () => {
    expect(applyDiscount(500, 'usd', { percentOff: null, amountOff: 1000, currency: 'usd' })).toEqual({ originalAmount: 500, discountAmount: 500, amount: 0 });
  });
  it('un monto fijo en otra moneda no aplica', () => {
    expect(applyDiscount(4900, 'usd', { percentOff: null, amountOff: 1000, currency: 'eur' })).toBeNull();
  });
  it('rechaza porcentajes fuera de 1-100 y reglas vacías', () => {
    expect(applyDiscount(4900, 'usd', { percentOff: 0, amountOff: null })).toBeNull();
    expect(applyDiscount(4900, 'usd', { percentOff: 101, amountOff: null })).toBeNull();
    expect(applyDiscount(4900, 'usd', { percentOff: null, amountOff: null })).toBeNull();
  });
});

describe('priceView', () => {
  const quote = { originalAmount: 4900, discountAmount: 1000, amount: 3900, currency: 'usd', coupon: { code: 'SPRING', percentOff: null, amountOff: 1000 } };
  it('sin cupón muestra el precio de lista', () => {
    expect(priceView(4900, null)).toEqual({ hasDiscount: false, original: null, final: 4900, isFree: false, couponCode: null });
  });
  it('con descuento tacha el original y muestra el final', () => {
    expect(priceView(4900, quote)).toEqual({ hasDiscount: true, original: 4900, final: 3900, isFree: false, couponCode: 'SPRING' });
  });
  it('con 100 % queda gratis', () => {
    expect(priceView(4900, { ...quote, discountAmount: 4900, amount: 0 }).isFree).toBe(true);
  });
});

describe('cupones: texto', () => {
  it('normaliza el código', () => {
    expect(normalizeCouponCode(' spring-25 !')).toBe('SPRING-25');
    expect(normalizeCouponCode(null)).toBe('');
  });
  it('traduce el code del error', () => {
    expect(couponErrorMessage({ error: { code: 'coupon_expired' } })).toBe('This coupon has expired.');
    expect(couponErrorMessage({ error: { code: 'coupon_exhausted' } })).toContain('usage limit');
    expect(couponErrorMessage({ error: { code: 'coupon_not_applicable' } })).toContain("can't be used");
    expect(couponErrorMessage({ error: { code: 'coupon_invalid' } })).toContain("isn't valid");
  });
  it('usa el mensaje del servidor o uno genérico si no hay code', () => {
    expect(couponErrorMessage({ error: { error: 'Boom' } })).toBe('Boom');
    expect(couponErrorMessage(null)).toContain('Please try again');
  });
});
