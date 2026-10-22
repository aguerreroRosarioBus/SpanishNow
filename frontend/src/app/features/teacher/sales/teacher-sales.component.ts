import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../../core/services/sales.service';
import { SalesSummary, SalesTotal } from '../../../core/models/sales.model';
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
  imports: [TranslatePipe, RouterLink],
  templateUrl: './teacher-sales.component.html',
  styleUrl: './teacher-sales.component.scss'
})
export class TeacherSalesComponent implements OnInit {
  i18n = inject(I18nService);
  number(value: number): string { return this.i18n.formatNumber(value); }
  private service = inject(SalesService);

  readonly chartW = CHART_W;
  readonly chartH = CHART_H;
  readonly periods: Array<{ value: SalesPeriod; label: string }> = [
    { value: '30d', label: 'teacherCommerce.days30' },
    { value: '12m', label: 'teacherCommerce.months12' },
    { value: 'all', label: 'teacherCommerce.all' }
  ];

  period = signal<SalesPeriod>('12m');
  summary = signal<SalesSummary | null>(null);
  isLoading = signal(true);
  private errorMessageFailure = signal<{key: string; error?: unknown} | null>(null);
  errorMessage = computed(() => { const f = this.errorMessageFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });

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
        ...b, label: monthLabel(b.month, this.i18n.intlLocale()), valueLabel: this.i18n.formatMoney(b.value, currency)
      }));
      return [{
        currency,
        ticks: scale.ticks.map(value => ({ value, y: CHART_H - (value / scale.max) * CHART_H, label: this.i18n.formatMoney(Math.round(value), currency) })),
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
    this.errorMessageFailure.set(null);
    const { from, to } = periodRange(this.period());
    this.service.summary(from, to).subscribe({
      next: summary => { this.summary.set(summary); this.isLoading.set(false); },
      error: error => { this.errorMessageFailure.set({key: 'teacherCommerce.salesError', error}); this.isLoading.set(false); }
    });
  }

  money(cents: number, currency: string): string { return this.i18n.formatMoney(cents, currency); }
  totalFor(currency: string): SalesTotal | undefined { return this.summary()?.totals.find(t => t.currency.toLowerCase() === currency.toLowerCase()); }
  chartFor(currency: string): CurrencyChart | undefined { return this.charts().find(c => c.currency === currency); }
}
