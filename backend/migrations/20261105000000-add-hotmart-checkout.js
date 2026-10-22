'use strict';

/**
 * Courses sold on Hotmart: the Hotmart product that maps to the course (matched against the webhook) and its checkout link.
 * Orders gain the 'hotmart' provider. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('courses');
    if (!columns.hotmartProductId) await q.addColumn('courses', 'hotmartProductId', { type: S.STRING(40), allowNull: true });
    if (!columns.hotmartCheckoutUrl) await q.addColumn('courses', 'hotmartCheckoutUrl', { type: S.STRING(500), allowNull: true });
    const indexes = await q.showIndex('courses');
    if (!indexes.some(index => index.name === 'courses_hotmart_product')) {
      await q.addIndex('courses', ['hotmartProductId'], { name: 'courses_hotmart_product', unique: true });
    }

    const orders = await q.describeTable('orders');
    if (!/'hotmart'/.test(orders.provider.type)) {
      await q.sequelize.query("ALTER TABLE orders MODIFY COLUMN provider ENUM('stripe','fake','coupon','hotmart') NOT NULL");
    }
  },

  async down(q) {
    const orders = await q.describeTable('orders');
    if (/'hotmart'/.test(orders.provider.type)) {
      const [[{ total }]] = await q.sequelize.query("SELECT COUNT(*) AS total FROM orders WHERE provider = 'hotmart'");
      if (Number(total) > 0 && process.env.CONFIRM_HOTMART_DATA_LOSS !== 'yes') {
        throw new Error('Hotmart orders exist; export them and set CONFIRM_HOTMART_DATA_LOSS=yes before rollback');
      }
      await q.sequelize.query("DELETE FROM orders WHERE provider = 'hotmart'");
      await q.sequelize.query("ALTER TABLE orders MODIFY COLUMN provider ENUM('stripe','fake','coupon') NOT NULL");
    }
    const indexes = await q.showIndex('courses');
    if (indexes.some(index => index.name === 'courses_hotmart_product')) await q.removeIndex('courses', 'courses_hotmart_product');
    const columns = await q.describeTable('courses');
    for (const name of ['hotmartCheckoutUrl', 'hotmartProductId']) {
      if (columns[name]) await q.removeColumn('courses', name);
    }
  }
};
