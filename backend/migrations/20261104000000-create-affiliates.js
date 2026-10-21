'use strict';

const hasTable = async (q, table) => (await q.showAllTables()).some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === table);

/**
 * Affiliates of a teacher (no account, no login: they get a private dashboard link) and the payouts the teacher registers
 * to them. `code` is unique across the platform; `dashboardToken` is the secret of the private link (unique, can be regenerated).
 * Payouts are financial records: they are never deleted by cascade from anything but the affiliate (which is only deletable
 * without sales). Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    if (!(await hasTable(q, 'affiliates'))) {
      await q.createTable('affiliates', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        teacherId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        name: { type: S.STRING(100), allowNull: false },
        email: { type: S.STRING(255), allowNull: false },
        code: { type: S.STRING(40), allowNull: false },
        commissionPercent: { type: S.INTEGER, allowNull: false },
        dashboardToken: { type: S.STRING(64), allowNull: false },
        active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        notes: { type: S.TEXT, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = (await q.showIndex('affiliates')).map(index => index.name);
    if (!indexes.includes('affiliates_code_unique')) await q.addIndex('affiliates', ['code'], { name: 'affiliates_code_unique', unique: true });
    if (!indexes.includes('affiliates_token_unique')) await q.addIndex('affiliates', ['dashboardToken'], { name: 'affiliates_token_unique', unique: true });
    if (!indexes.includes('affiliates_teacher')) await q.addIndex('affiliates', ['teacherId'], { name: 'affiliates_teacher' });

    if (!(await hasTable(q, 'affiliate_payouts'))) {
      await q.createTable('affiliate_payouts', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        affiliateId: { type: S.INTEGER, allowNull: false, references: { model: 'affiliates', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        // In cents.
        amount: { type: S.INTEGER, allowNull: false },
        currency: { type: S.STRING(3), allowNull: false },
        paidAt: { type: S.DATE, allowNull: false },
        note: { type: S.STRING(300), allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const payoutIndexes = (await q.showIndex('affiliate_payouts')).map(index => index.name);
    if (!payoutIndexes.includes('affiliate_payouts_affiliate_paid')) {
      await q.addIndex('affiliate_payouts', ['affiliateId', 'paidAt'], { name: 'affiliate_payouts_affiliate_paid' });
    }
  },

  async down(q) {
    for (const table of ['affiliate_payouts', 'affiliates']) {
      if (!(await hasTable(q, table))) continue;
      const [[{ total }]] = await q.sequelize.query(`SELECT COUNT(*) AS total FROM ${table}`);
      if (Number(total) > 0 && process.env.CONFIRM_AFFILIATES_DATA_LOSS !== 'yes') {
        throw new Error('Affiliates or payouts exist; export them and set CONFIRM_AFFILIATES_DATA_LOSS=yes before rollback');
      }
    }
    if (await hasTable(q, 'affiliate_payouts')) await q.dropTable('affiliate_payouts');
    if (await hasTable(q, 'affiliates')) await q.dropTable('affiliates');
  }
};
