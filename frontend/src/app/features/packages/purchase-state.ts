import { ClassPurchase } from './packages.model';

/** Estado del reembolso visible para quien compra o vende: pedido, en trámite o ya devuelto (D3-DIN-04). */
export type RefundKind = 'requested' | 'processing' | 'refunded';

export function refundKind(p: Pick<ClassPurchase, 'refund'>): RefundKind | null {
  const status = p.refund?.status;
  if (!status) return null;
  return status === 'confirmed' ? 'refunded' : status === 'queued' || status === 'manual_hotmart' ? 'processing' : 'requested';
}

/** Un reembolso aprobado o confirmado pesa más que «Cancelado»: la compra sigue guardada, pero ya no es utilizable. */
export function purchaseStatusKey(p: ClassPurchase): string {
  const kind = refundKind(p);
  return kind === 'refunded' || kind === 'processing' ? `packages.purchase.refund.${kind}` : `packages.purchase.status.${p.status}`;
}

export function purchaseTone(p: ClassPurchase): string {
  const kind = refundKind(p);
  if (kind === 'refunded') return 'neutral';
  if (kind === 'processing') return 'warning';
  return p.status === 'active' ? 'success' : p.status === 'paused' ? 'warning' : p.status === 'cancelled' ? 'danger' : 'neutral';
}

/** Cerrada: ya no hay clases que reservar ni vencimiento que mostrar. */
export function isClosedPurchase(p: ClassPurchase): boolean {
  const kind = refundKind(p);
  return p.status === 'cancelled' || kind === 'refunded' || kind === 'processing';
}
