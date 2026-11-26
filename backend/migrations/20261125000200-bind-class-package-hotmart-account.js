'use strict';

const fields = S => ({
  teacher_hotmart_connections: {classActiveDigest:S.STRING(64),classPendingDigest:S.STRING(64),classVerifiedAt:S.DATE},
  class_package_provider_verifications: {teacherId:S.INTEGER,connectionDigest:S.STRING(64),mappingDigests:S.JSON},
  class_package_orders: {hotmartConnectionId:S.UUID}
});

module.exports = {
  async up(q, S) {
    for (const [table, columns] of Object.entries(fields(S))) {
      const existing = await q.describeTable(table);
      for (const [column, type] of Object.entries(columns)) {
        if (!existing[column]) await q.addColumn(table, column, {type, allowNull:true});
      }
    }
  },
  async down(q, S) {
    for (const [table, columns] of Object.entries(fields(S)).reverse()) {
      const existing = await q.describeTable(table);
      for (const column of Object.keys(columns)) if (existing[column]) await q.removeColumn(table, column);
    }
  }
};
