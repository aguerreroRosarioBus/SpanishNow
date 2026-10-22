import { LocaleDatePipe } from '../../../core/i18n/locale-format.pipe';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../../core/services/sales.service';
import { MyOrder } from '../../../core/models/sales.model';
import { OrderBadge, orderBadge } from '../../../shared/utils/order-status';

/** «Mis compras»: historial de compras del alumno con link al recibo. */
@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [LocaleDatePipe, TranslatePipe, RouterLink],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss'
})
export class PurchasesComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private readonly preferences = inject(UserPreferencesService);
  readonly timeZone = computed(() => this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  private service = inject(SalesService);

  orders = signal<MyOrder[]>([]);
  isLoading = signal(true);
  private failure = signal<unknown>(null);
  errorMessage = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'student.purchasesError') : '');

  ngOnInit(): void {
    this.service.myOrders().subscribe({
      next: list => { this.orders.set(list); this.isLoading.set(false); },
      error: error => { this.failure.set(error); this.isLoading.set(false); }
    });
  }

  money(cents: number, currency: string): string { return this.i18n.formatMoney(cents, currency); }
  badge(o: MyOrder): OrderBadge { return orderBadge(o.status, o.refundedAmount); }
  badgeLabel(o: MyOrder): string { return this.i18n.t('student.order.' + this.badge(o)); }
}
