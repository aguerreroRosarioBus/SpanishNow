'use strict';

const table = 'teacher_hotmart_connections';

module.exports = {
  async up(q, S) {
    if (!(await q.showAllTables()).includes(table)) {
      await q.createTable(table, {
        teacherId: { type: S.INTEGER, primaryKey: true, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        publicId: { type: S.UUID, allowNull: false, unique: true },
        activeDigest: { type: S.STRING(64), allowNull: true },
        pendingDigest: { type: S.STRING(64), allowNull: true },
        verifiedAt: { type: S.DATE, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    if (!(await q.describeTable('courses')).hotmartOwnAccount) {
      await q.addColumn('courses', 'hotmartOwnAccount', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
    }
  },

  async down(q) {
    if ((await q.describeTable('courses')).hotmartOwnAccount) await q.removeColumn('courses', 'hotmartOwnAccount');
    if ((await q.showAllTables()).includes(table)) await q.dropTable(table);
  }
};
