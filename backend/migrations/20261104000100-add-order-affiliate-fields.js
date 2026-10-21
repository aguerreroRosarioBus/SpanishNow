'use strict';

const TABLE = 'orders';

const dropForeignKeysOf = async (q, column) => {
  const references = await q.getForeignKeyReferencesForTable(TABLE);
  for (const reference of references.filter(r => r.columnName === column)) {
    await q.removeConstraint(TABLE, reference.constraintName);
  }
};

/**
 * Affiliate attribution of an order. `affiliateId` is set when the checkout starts; the commission is computed when the order
 * is fulfilled, with the affiliate's percentage at that moment, stored in `commissionPercent` so refunds can recompute it:
 *   commissionAmount (cents, same currency as the order) = floor((amount - refundedAmount) * commissionPercent / 100)
 *   commissionStatus: 'none' (no commission: not fulfilled yet, 100 % coupon, self-referral), 'pending', 'void' (fully refunded).
 * Existing orders keep their values: no affiliate, no commission. RESTRICT: an affiliate with orders cannot be deleted. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable(TABLE);
    if (!columns.affiliateId) {
      await q.addColumn(TABLE, 'affiliateId', { type: S.INTEGER, allowNull: true, references: { model: 'affiliates', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
    }
    if (!columns.commissionPercent) await q.addColumn(TABLE, 'commissionPercent', { type: S.INTEGER, allowNull: true });
    if (!columns.commissionAmount) await q.addColumn(TABLE, 'commissionAmount', { type: S.INTEGER, allowNull: false, defaultValue: 0 });
    if (!columns.commissionStatus) {
      await q.addColumn(TABLE, 'commissionStatus', { type: S.ENUM('none', 'pending', 'void'), allowNull: false, defaultValue: 'none' });
    }
    const indexes = (await q.showIndex(TABLE)).map(index => index.name);
    if (!indexes.includes('orders_affiliate_status')) await q.addIndex(TABLE, ['affiliateId', 'status'], { name: 'orders_affiliate_status' });
  },

  async down(q) {
    const columns = await q.describeTable(TABLE);
    if (columns.affiliateId) {
      const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM orders WHERE affiliateId IS NOT NULL OR commissionAmount > 0');
      if (Number(total) > 0 && process.env.CONFIRM_ORDER_AFFILIATE_DATA_LOSS !== 'yes') {
        throw new Error('Orders with an affiliate or a commission exist; export them and set CONFIRM_ORDER_AFFILIATE_DATA_LOSS=yes before rollback');
      }
    }
    // The foreign key leans on the composite index: drop it first.
    if (columns.affiliateId) await dropForeignKeysOf(q, 'affiliateId');
    const indexes = (await q.showIndex(TABLE)).map(index => index.name);
    if (indexes.includes('orders_affiliate_status')) await q.removeIndex(TABLE, 'orders_affiliate_status');
    if (columns.affiliateId) await q.removeColumn(TABLE, 'affiliateId');
    for (const name of ['commissionStatus', 'commissionAmount', 'commissionPercent']) {
      if (columns[name]) await q.removeColumn(TABLE, name);
    }
  }
};
