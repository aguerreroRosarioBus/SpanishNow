import { CheckoutQuote, CouponErrorCode } from '../../core/models/sales.model';

/** Lo mínimo de un cupón que hace falta para estimar el descuento. */
export interface DiscountRule {
  percentOff: number | null;
  /** Centavos. */
  amountOff: number | null;
  currency?: string | null;
}

export interface PriceBreakdown {
  originalAmount: number;
  discountAmount: number;
  amount: number;
}

/**
 * Estimación del precio con cupón (espejo de la regla del servidor, que es quien decide el precio real):
 * porcentaje o monto fijo, nunca por debajo de 0, y un monto fijo en otra moneda no aplica (null).
 */
export function applyDiscount(price: number, currency: string, rule: DiscountRule): PriceBreakdown | null {
  const original = Math.max(0, Math.round(price));
  let discount = 0;
  if (rule.percentOff != null) {
    if (rule.percentOff < 1 || rule.percentOff > 100) return null;
    discount = Math.round((original * rule.percentOff) / 100);
  } else if (rule.amountOff != null) {
    if (rule.currency && rule.currency.toLowerCase() !== currency.toLowerCase()) return null;
    discount = rule.amountOff;
  } else {
    return null;
  }
  discount = Math.min(Math.max(0, discount), original);
  return { originalAmount: original, discountAmount: discount, amount: original - discount };
}

/** Presentación del precio en la página de venta a partir de la respuesta de /checkout/quote. */
export interface PriceView {
  hasDiscount: boolean;
  /** Precio tachado (solo si hay descuento). */
  original: number | null;
  final: number;
  isFree: boolean;
  couponCode: string | null;
}

export function priceView(listPrice: number, quote: CheckoutQuote | null): PriceView {
  if (!quote) return { hasDiscount: false, original: null, final: listPrice, isFree: false, couponCode: null };
  const hasDiscount = quote.discountAmount > 0;
  return {
    hasDiscount,
    original: hasDiscount ? quote.originalAmount : null,
    final: quote.amount,
    isFree: quote.amount === 0,
    couponCode: quote.coupon?.code ?? null
  };
}

/** Normaliza un código escrito a mano: mayúsculas, sin espacios, solo A-Z, 0-9 y guion. */
export function normalizeCouponCode(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

const COUPON_ERRORS: Record<CouponErrorCode, string> = {
  coupon_invalid: "This coupon code isn't valid.",
  coupon_expired: 'This coupon has expired.',
  coupon_exhausted: 'This coupon has reached its usage limit.',
  coupon_not_applicable: "This coupon can't be used for this course."
};

/** Mensaje en inglés para el comprador según el `code` del error 400. */
export function couponErrorMessage(error: { error?: { code?: string; error?: string } } | null | undefined): string {
  const code = error?.error?.code as CouponErrorCode | undefined;
  if (code && COUPON_ERRORS[code]) return COUPON_ERRORS[code];
  return error?.error?.error || 'We could not apply this coupon. Please try again.';
}
