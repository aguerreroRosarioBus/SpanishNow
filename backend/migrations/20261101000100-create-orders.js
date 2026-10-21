'use strict';

const TABLE = 'orders';
const SESSION_INDEX = 'orders_provider_session_unique';

/**
 * Purchases of a course. One row per checkout session; `providerSessionId` is unique so a payment event
 * can be matched (and replayed) without creating a second order. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    const exists = tables.some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);
    if (!exists) {
      await q.createTable(TABLE, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        // Orders are financial records: a course with orders cannot be deleted (RESTRICT).
        courseId: { type: S.INTEGER, allowNull: false, references: { model: 'courses', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
        // Known only after the payment is confirmed (anonymous buyers).
        userId: { type: S.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
        // Null until the payment provider tells us the buyer's email (anonymous buyers).
        email: { type: S.STRING(255), allowNull: true },
        amount: { type: S.INTEGER, allowNull: false },
        currency: { type: S.STRING(3), allowNull: false },
        status: { type: S.ENUM('pending', 'paid', 'refunded', 'failed'), allowNull: false, defaultValue: 'pending' },
        provider: { type: S.ENUM('stripe', 'fake'), allowNull: false },
        providerSessionId: { type: S.STRING(255), allowNull: false },
        providerPaymentId: { type: S.STRING(255), allowNull: true },
        paidAt: { type: S.DATE, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = await q.showIndex(TABLE);
    if (!indexes.some(index => index.name === SESSION_INDEX)) {
      await q.addIndex(TABLE, ['providerSessionId'], { name: SESSION_INDEX, unique: true });
    }
    if (!indexes.some(index => index.name === 'orders_email')) {
      await q.addIndex(TABLE, ['email'], { name: 'orders_email' });
    }
  },

  async down(q) {
    const tables = await q.showAllTables();
    const exists = tables.some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);
    if (!exists) return;
    const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM orders');
    if (Number(total) > 0 && process.env.CONFIRM_ORDERS_DATA_LOSS !== 'yes') {
      throw new Error('Orders exist; export them and set CONFIRM_ORDERS_DATA_LOSS=yes before rollback');
    }
    await q.dropTable(TABLE);
  }
};
