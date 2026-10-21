'use strict';

const TABLE = 'orders';

const dropForeignKeysOf = async (q, column) => {
  const references = await q.getForeignKeyReferencesForTable(TABLE);
  for (const reference of references.filter(r => r.columnName === column)) {
    await q.removeConstraint(TABLE, reference.constraintName);
  }
};

/**
 * Coupon, discount and refund data of an order, the receipt link, and the 'coupon' provider (orders of 100 % discount that
 * never go through a payment provider). Existing orders keep their values: no coupon, no discount, nothing refunded.
 * Also indexes for the Stripe refund lookup (providerPaymentId) and for sales reports (status, paidAt). Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable(TABLE);
    if (!columns.couponId) {
      await q.addColumn(TABLE, 'couponId', { type: S.INTEGER, allowNull: true, references: { model: 'coupons', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    }
    // Price of the course when the order was made, before the discount (null in orders that predate coupons).
    if (!columns.originalAmount) await q.addColumn(TABLE, 'originalAmount', { type: S.INTEGER, allowNull: true });
    if (!columns.discountAmount) await q.addColumn(TABLE, 'discountAmount', { type: S.INTEGER, allowNull: false, defaultValue: 0 });
    if (!columns.refundedAmount) await q.addColumn(TABLE, 'refundedAmount', { type: S.INTEGER, allowNull: false, defaultValue: 0 });
    if (!columns.refundedAt) await q.addColumn(TABLE, 'refundedAt', { type: S.DATE, allowNull: true });
    if (!columns.receiptUrl) await q.addColumn(TABLE, 'receiptUrl', { type: S.STRING(500), allowNull: true });

    if (!/'coupon'/.test(columns.provider.type)) {
      await q.sequelize.query("ALTER TABLE orders MODIFY COLUMN provider ENUM('stripe','fake','coupon') NOT NULL");
    }

    const indexes = await q.showIndex(TABLE);
    if (!indexes.some(index => index.name === 'orders_provider_payment')) {
      await q.addIndex(TABLE, ['providerPaymentId'], { name: 'orders_provider_payment' });
    }
    if (!indexes.some(index => index.name === 'orders_status_paid_at')) {
      await q.addIndex(TABLE, ['status', 'paidAt'], { name: 'orders_status_paid_at' });
    }
  },

  async down(q) {
    const columns = await q.describeTable(TABLE);
    const [[{ total }]] = await q.sequelize.query(
      "SELECT COUNT(*) AS total FROM orders WHERE provider = 'coupon' OR couponId IS NOT NULL OR refundedAmount > 0 OR discountAmount > 0 OR receiptUrl IS NOT NULL"
    );
    if (Number(total) > 0 && process.env.CONFIRM_ORDER_SALES_DATA_LOSS !== 'yes') {
      throw new Error('Orders with coupons, refunds or receipts exist; export them and set CONFIRM_ORDER_SALES_DATA_LOSS=yes before rollback');
    }
    const indexes = await q.showIndex(TABLE);
    for (const name of ['orders_status_paid_at', 'orders_provider_payment']) {
      if (indexes.some(index => index.name === name)) await q.removeIndex(TABLE, name);
    }
    if (columns.provider && /'coupon'/.test(columns.provider.type)) {
      await q.sequelize.query("DELETE FROM orders WHERE provider = 'coupon'");
      await q.sequelize.query("ALTER TABLE orders MODIFY COLUMN provider ENUM('stripe','fake') NOT NULL");
    }
    if (columns.couponId) {
      await dropForeignKeysOf(q, 'couponId');
      await q.removeColumn(TABLE, 'couponId');
    }
    for (const name of ['receiptUrl', 'refundedAt', 'refundedAmount', 'discountAmount', 'originalAmount']) {
      if (columns[name]) await q.removeColumn(TABLE, name);
    }
  }
};
