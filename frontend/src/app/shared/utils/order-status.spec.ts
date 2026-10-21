import { orderBadge, orderBadgeLabel } from './order-status';

describe('order-status', () => {
  it('pagada sin reembolso', () => expect(orderBadgeLabel('paid', 0)).toBe('Pagada'));
  it('pagada con reembolso parcial', () => expect(orderBadge('paid', 500)).toBe('partial'));
  it('reembolsada', () => expect(orderBadgeLabel('refunded', 4900)).toBe('Reembolsada'));
  it('otros estados', () => expect(orderBadgeLabel('pending', 0)).toBe('Pendiente'));
});
