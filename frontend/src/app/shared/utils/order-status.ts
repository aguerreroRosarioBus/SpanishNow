import { OrderStatus } from '../../core/models/sales.model';

export type OrderBadge = 'paid' | 'partial' | 'refunded' | 'pending' | 'failed';

/** Estado visible de una orden: una pagada con reembolso parcial se muestra aparte. */
export function orderBadge(status: OrderStatus, refundedAmount: number): OrderBadge {
  if (status === 'refunded') return 'refunded';
  if (status === 'paid') return refundedAmount > 0 ? 'partial' : 'paid';
  return status;
}

const LABELS: Record<OrderBadge, string> = {
  paid: 'Pagada',
  partial: 'Reembolso parcial',
  refunded: 'Reembolsada',
  pending: 'Pendiente',
  failed: 'Fallida'
};

export function orderBadgeLabel(status: OrderStatus, refundedAmount: number): string {
  return LABELS[orderBadge(status, refundedAmount)] ?? status;
}
