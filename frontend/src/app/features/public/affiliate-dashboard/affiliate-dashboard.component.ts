import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { AffiliateDashboard, CommissionStatus } from '../../../core/models/community.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { copyText } from '../../../shared/utils/clipboard';
import { formatPrice } from '../../../shared/utils/money';

/** Panel privado del afiliado (/affiliate/:token). Público, sin login y en inglés; no muestra datos de compradores. */
@Component({
  selector: 'app-affiliate-dashboard',
  standalone: true,
  imports: [DatePipe, IconComponent],
  templateUrl: './affiliate-dashboard.component.html',
  styleUrl: './affiliate-dashboard.component.scss'
})
export class AffiliateDashboardComponent implements OnInit {
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

  money(cents: number, currency: string): string { return formatPrice(cents, currency, 'en-US'); }

  statusLabel(status: CommissionStatus): string {
    return status === 'pending' ? 'Pending' : status === 'void' ? 'Voided' : 'No commission';
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
