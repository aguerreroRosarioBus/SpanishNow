export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
}
export function parseMoneyInput(text: string, currency: string): number | null {
  try {
    const digits=currencyDigits(currency), normalized=text.trim().replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
    const [whole, fraction='']=normalized.split('.');
    if (fraction.length>digits) return null;
    const value=Number(whole+fraction.padEnd(digits,'0'));
    return Number.isSafeInteger(value)&&value>0?value:null;
  } catch { return null; }
}
export function moneyInputValue(minor: number, currency: string): string {
  const digits=currencyDigits(currency), raw=String(minor).padStart(digits+1,'0');
  return digits?raw.slice(0,-digits)+'.'+raw.slice(-digits):raw;
}
