import { SalesByMonth, SalesTotal } from '../../../core/models/sales.model';

/** Escala "linda" para el eje Y: máximo redondeado hacia arriba y marcas parejas. */
export interface NiceScale { max: number; step: number; ticks: number[]; }

export function niceScale(maxValue: number, targetTicks = 4): NiceScale {
  if (!isFinite(maxValue) || maxValue <= 0) return { max: 1, step: 1, ticks: [0, 1] };
  const rawStep = maxValue / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max, step, ticks };
}

export interface Bar { month: string; value: number; orders: number; x: number; y: number; width: number; height: number; }

/** Posición de cada barra dentro del área de dibujo (0,0 arriba a la izquierda). */
export function barLayout(points: Array<{ month: string; value: number; orders: number }>, scaleMax: number, width: number, height: number, gap = 0.3): Bar[] {
  if (points.length === 0 || scaleMax <= 0) return [];
  const slot = width / points.length;
  const barWidth = slot * (1 - gap);
  return points.map((p, i) => {
    const h = Math.max(0, Math.min(1, p.value / scaleMax)) * height;
    return { month: p.month, value: p.value, orders: p.orders, x: i * slot + (slot - barWidth) / 2, y: height - h, width: barWidth, height: h };
  });
}

/** Lista de meses 'YYYY-MM' desde `from` hasta `to` inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 600) break;
  }
  return out;
}

/** Serie de una moneda con los meses sin ventas rellenados en 0 (para que el eje X sea continuo). */
export function seriesForCurrency(byMonth: SalesByMonth[], currency: string): Array<{ month: string; value: number; orders: number }> {
  const rows = byMonth.filter(r => r.currency.toLowerCase() === currency.toLowerCase()).sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length === 0) return [];
  const byKey = new Map(rows.map(r => [r.month, r]));
  return monthRange(rows[0].month, rows[rows.length - 1].month).map(month => {
    const r = byKey.get(month);
    return { month, value: r?.net ?? 0, orders: r?.orders ?? 0 };
  });
}

/** Monedas presentes (de los totales y de las series), sin repetir y en orden estable. */
export function currenciesOf(totals: SalesTotal[], byMonth: SalesByMonth[]): string[] {
  const seen: string[] = [];
  for (const c of [...totals.map(t => t.currency), ...byMonth.map(m => m.currency)]) {
    const key = c.toLowerCase();
    if (!seen.includes(key)) seen.push(key);
  }
  return seen;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM' → 'mar 26' (corto, para el eje) o 'marzo 2026' no hace falta: se usa siempre la forma corta. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(-2)}`;
}

/** Fechas 'YYYY-MM-DD' de un período del selector, hasta hoy. `all` no manda fechas. */
export type SalesPeriod = '30d' | '12m' | 'all';

export function periodRange(period: SalesPeriod, today = new Date()): { from?: string; to?: string } {
  if (period === 'all') return {};
  const to = new Date(today);
  const from = new Date(today);
  if (period === '30d') from.setDate(from.getDate() - 30);
  else from.setFullYear(from.getFullYear() - 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
