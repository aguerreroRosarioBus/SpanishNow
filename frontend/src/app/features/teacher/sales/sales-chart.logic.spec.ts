import { barLayout, currenciesOf, monthLabel, monthRange, niceScale, periodRange, seriesForCurrency } from './sales-chart.logic';

describe('niceScale', () => {
  it('redondea el máximo hacia arriba con marcas parejas', () => {
    expect(niceScale(8700)).toEqual({ max: 10000, step: 5000, ticks: [0, 5000, 10000] });
  });
  it('maneja valores chicos y exactos', () => {
    expect(niceScale(100, 4)).toEqual({ max: 100, step: 50, ticks: [0, 50, 100] });
    expect(niceScale(3, 4).ticks[0]).toBe(0);
  });
  it('sin datos devuelve una escala válida', () => {
    expect(niceScale(0)).toEqual({ max: 1, step: 1, ticks: [0, 1] });
    expect(niceScale(NaN).max).toBe(1);
  });
  it('el máximo nunca queda por debajo del dato', () => {
    for (const v of [1, 7, 99, 1234, 56789, 1e6 + 1]) expect(niceScale(v).max).toBeGreaterThanOrEqual(v);
  });
});

describe('barLayout', () => {
  it('escala las alturas al máximo de la escala', () => {
    const bars = barLayout([{ month: '2026-01', value: 50, orders: 1 }, { month: '2026-02', value: 100, orders: 2 }], 100, 200, 100);
    expect(bars[0].height).toBe(50);
    expect(bars[0].y).toBe(50);
    expect(bars[1].height).toBe(100);
    expect(bars[1].y).toBe(0);
    expect(bars[1].x).toBeGreaterThan(bars[0].x);
  });
  it('sin puntos o sin escala devuelve vacío', () => {
    expect(barLayout([], 100, 200, 100)).toEqual([]);
    expect(barLayout([{ month: '2026-01', value: 1, orders: 1 }], 0, 200, 100)).toEqual([]);
  });
});

describe('meses y monedas', () => {
  it('monthRange cruza el cambio de año', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('seriesForCurrency rellena huecos y no mezcla monedas', () => {
    const rows = [
      { month: '2026-01', currency: 'usd', net: 1000, orders: 1 },
      { month: '2026-03', currency: 'usd', net: 500, orders: 1 },
      { month: '2026-02', currency: 'eur', net: 9999, orders: 3 }
    ];
    expect(seriesForCurrency(rows, 'usd')).toEqual([
      { month: '2026-01', value: 1000, orders: 1 },
      { month: '2026-02', value: 0, orders: 0 },
      { month: '2026-03', value: 500, orders: 1 }
    ]);
    expect(seriesForCurrency(rows, 'gbp')).toEqual([]);
  });
  it('currenciesOf junta monedas sin repetir', () => {
    expect(currenciesOf([{ currency: 'usd', gross: 0, refunds: 0, net: 0, orders: 0, refundsCount: 0 }], [{ month: '2026-01', currency: 'EUR', net: 1, orders: 1 }, { month: '2026-01', currency: 'usd', net: 1, orders: 1 }])).toEqual(['usd', 'eur']);
  });
  it('monthLabel', () => { expect(monthLabel('2026-03')).toBe('mar 26'); });
  it('periodRange', () => {
    const today = new Date(2026, 5, 15);
    expect(periodRange('30d', today)).toEqual({ from: '2026-05-16', to: '2026-06-15' });
    expect(periodRange('12m', today)).toEqual({ from: '2025-06-15', to: '2026-06-15' });
    expect(periodRange('all', today)).toEqual({});
  });
});
