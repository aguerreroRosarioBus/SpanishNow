/** Formatea un monto en centavos con la moneda del curso (p. ej. 4900, 'usd' → $49.00). */
export function formatPrice(cents: number | undefined | null, currency: string | undefined | null, locale = 'en-US'): string {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${(currency || '').toUpperCase()}`.trim();
  }
}
