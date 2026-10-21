'use strict';

const TABLE = 'coupons';
const CODE_INDEX = 'coupons_code_unique';

const hasTable = async q => (await q.showAllTables()).some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);

/**
 * Discount coupons of a teacher: a percentage or a fixed amount (cents, in one currency), for one course or all of the
 * teacher's courses, with an optional limit of uses and expiry date. `code` is unique across the platform (stored uppercase).
 * Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    if (!(await hasTable(q))) {
      await q.createTable(TABLE, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        teacherId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        code: { type: S.STRING(40), allowNull: false },
        percentOff: { type: S.INTEGER, allowNull: true },
        amountOff: { type: S.INTEGER, allowNull: true },
        currency: { type: S.STRING(3), allowNull: true },
        // null = every course of the teacher
        courseId: { type: S.INTEGER, allowNull: true, references: { model: 'courses', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        maxRedemptions: { type: S.INTEGER, allowNull: true },
        redemptions: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        expiresAt: { type: S.DATE, allowNull: true },
        active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = await q.showIndex(TABLE);
    if (!indexes.some(index => index.name === CODE_INDEX)) {
      await q.addIndex(TABLE, ['code'], { name: CODE_INDEX, unique: true });
    }
  },

  async down(q) {
    if (!(await hasTable(q))) return;
    const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM coupons');
    if (Number(total) > 0 && process.env.CONFIRM_COUPONS_DATA_LOSS !== 'yes') {
      throw new Error('Coupons exist; export them and set CONFIRM_COUPONS_DATA_LOSS=yes before rollback');
    }
    await q.dropTable(TABLE);
  }
};
