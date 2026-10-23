import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { AffiliateDashboard, CommissionStatus } from '../../../core/models/community.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { copyText } from '../../../shared/utils/clipboard';
import { formatAvailableDate } from '../../../shared/utils/release-date';

/** Panel privado del afiliado (/affiliate/:token). Público, sin login; no muestra datos de compradores. */
@Component({
  selector: 'app-affiliate-dashboard',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  templateUrl: './affiliate-dashboard.component.html',
  styleUrl: './affiliate-dashboard.component.scss'
})
export class AffiliateDashboardComponent implements OnInit {
  private i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);
  private displayZone(): string { return this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  private route = inject(ActivatedRoute);
  private service = inject(AffiliateService);

  data = signal<AffiliateDashboard | null>(null);
  isLoading = signal(true);
  notFound = signal(false);
  loadError = signal(false);
  copiedUrl = signal('');
  /** Link que no se pudo copiar (se muestra seleccionable). */
  manualUrl = signal('');

  hasStats = computed(() => (this.data()?.stats ?? []).some(s => s.orders > 0 || s.paid > 0));

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.service.dashboard(token).subscribe({
      next: data => { this.data.set(data); this.isLoading.set(false); },
      error: error => {
        if (error?.status === 404) this.notFound.set(true); else this.loadError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  money(cents: number, currency: string): string { return this.i18n.formatMoney(cents, currency); }

  number(value: number): string { return this.i18n.formatNumber(value); }
  date(value: string | null): string {
    if (!value) return '—';
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatAvailableDate(value, this.i18n.intlLocale(), 'short') : this.i18n.formatInstant(value, this.displayZone(), { dateStyle: 'medium' });
  }

  statusLabel(status: CommissionStatus): string {
    return this.i18n.t(status === 'pending' ? 'affiliate.pending' : status === 'void' ? 'affiliate.void' : 'affiliate.none');
  }

  async copy(url: string): Promise<void> {
    if (await copyText(url)) {
      this.manualUrl.set('');
      this.copiedUrl.set(url);
      setTimeout(() => { if (this.copiedUrl() === url) this.copiedUrl.set(''); }, 2000);
    } else {
      this.manualUrl.set(url);
    }
  }
}
