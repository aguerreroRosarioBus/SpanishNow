import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../../core/services/sales.service';
import { SalesSummary, SalesTotal } from '../../../core/models/sales.model';
import { formatPrice } from '../../../shared/utils/money';
import { Bar, SalesPeriod, barLayout, currenciesOf, monthLabel, niceScale, periodRange, seriesForCurrency } from './sales-chart.logic';

const CHART_W = 640;
const CHART_H = 220;

interface CurrencyChart {
  currency: string;
  ticks: Array<{ value: number; y: number; label: string }>;
  bars: Array<Bar & { label: string; valueLabel: string }>;
  labelEvery: number;
}

/** Ventas del docente: tarjetas por moneda, ingresos por mes y por curso. Nunca se suman monedas distintas. */
@Component({
  selector: 'app-teacher-sales',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './teacher-sales.component.html',
  styleUrl: './teacher-sales.component.scss'
})
export class TeacherSalesComponent implements OnInit {
  private service = inject(SalesService);

  readonly chartW = CHART_W;
  readonly chartH = CHART_H;
  readonly periods: Array<{ value: SalesPeriod; label: string }> = [
    { value: '30d', label: '30 días' },
    { value: '12m', label: '12 meses' },
    { value: 'all', label: 'Todo' }
  ];

  period = signal<SalesPeriod>('12m');
  summary = signal<SalesSummary | null>(null);
  isLoading = signal(true);
  errorMessage = signal('');

  currencies = computed(() => {
    const s = this.summary();
    return s ? currenciesOf(s.totals, s.byMonth) : [];
  });
  isEmpty = computed(() => {
    const s = this.summary();
    return !!s && s.totals.every(t => t.orders === 0 && t.refundsCount === 0) && s.byMonth.length === 0;
  });

  charts = computed<CurrencyChart[]>(() => {
    const s = this.summary();
    if (!s) return [];
    return this.currencies().flatMap(currency => {
      const series = seriesForCurrency(s.byMonth, currency);
      if (series.length === 0) return [];
      const scale = niceScale(Math.max(...series.map(p => p.value)));
      const bars = barLayout(series, scale.max, CHART_W, CHART_H).map(b => ({
        ...b, label: monthLabel(b.month), valueLabel: formatPrice(b.value, currency, 'es')
      }));
      return [{
        currency,
        ticks: scale.ticks.map(value => ({ value, y: CHART_H - (value / scale.max) * CHART_H, label: formatPrice(value, currency, 'es') })),
        bars,
        labelEvery: Math.ceil(bars.length / 8)
      }];
    });
  });

  courseRows = computed(() => [...(this.summary()?.byCourse ?? [])].sort((a, b) => a.currency.localeCompare(b.currency) || b.net - a.net));

  ngOnInit(): void { this.load(); }

  setPeriod(period: SalesPeriod): void {
    if (this.period() === period) return;
    this.period.set(period);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    const { from, to } = periodRange(this.period());
    this.service.summary(from, to).subscribe({
      next: summary => { this.summary.set(summary); this.isLoading.set(false); },
      error: () => { this.errorMessage.set('No se pudo cargar el resumen de ventas.'); this.isLoading.set(false); }
    });
  }

  money(cents: number, currency: string): string { return formatPrice(cents, currency, 'es'); }
  totalFor(currency: string): SalesTotal | undefined { return this.summary()?.totals.find(t => t.currency.toLowerCase() === currency.toLowerCase()); }
  chartFor(currency: string): CurrencyChart | undefined { return this.charts().find(c => c.currency === currency); }
}
