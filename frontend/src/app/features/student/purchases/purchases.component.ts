import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../../core/services/sales.service';
import { MyOrder } from '../../../core/models/sales.model';
import { formatPrice } from '../../../shared/utils/money';
import { OrderBadge, orderBadge, orderBadgeLabel } from '../../../shared/utils/order-status';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ExpectationsViewComponent } from '../../legal/expectations-view/expectations-view.component';
import { CommercialSnapshot, SnapshotLegalDocument } from '../../legal/legal.model';
import { snapshotLink } from '../../legal/legal.service';

/** «Mis compras»: historial de compras del alumno con link al recibo. */
@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslatePipe, ExpectationsViewComponent],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss'
})
export class PurchasesComponent implements OnInit {
  private service = inject(SalesService);
  readonly i18n = inject(I18nService);

  orders = signal<MyOrder[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  ngOnInit(): void {
    this.service.myOrders().subscribe({
      next: list => { this.orders.set(list); this.isLoading.set(false); },
      error: () => { this.errorMessage.set('No se pudieron cargar tus compras.'); this.isLoading.set(false); }
    });
  }

  money(cents: number, currency: string): string { return formatPrice(cents, currency, 'es'); }
  // W02 (AC19): lo que vio y aceptó al comprar, aunque después cambien catálogo o legales.
  snapshotPrice(c: CommercialSnapshot): string { return this.i18n.formatMoney(c.price, c.currency); }
  docTitle(d: SnapshotLegalDocument): string { return d.content[this.i18n.locale()].title; }
  docLink = snapshotLink;
  badge(o: MyOrder): OrderBadge { return orderBadge(o.status, o.refundedAmount); }
  badgeLabel(o: MyOrder): string { return orderBadgeLabel(o.status, o.refundedAmount); }
}
