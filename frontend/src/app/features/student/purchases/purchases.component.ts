import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../../core/services/sales.service';
import { MyOrder } from '../../../core/models/sales.model';
import { formatPrice } from '../../../shared/utils/money';
import { OrderBadge, orderBadge, orderBadgeLabel } from '../../../shared/utils/order-status';

/** «Mis compras»: historial de compras del alumno con link al recibo. */
@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss'
})
export class PurchasesComponent implements OnInit {
  private service = inject(SalesService);

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
  badge(o: MyOrder): OrderBadge { return orderBadge(o.status, o.refundedAmount); }
  badgeLabel(o: MyOrder): string { return orderBadgeLabel(o.status, o.refundedAmount); }
}
