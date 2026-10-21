'use strict';

const TABLE = 'units';

/**
 * Drip content: `releaseAfterDays` (days after the student's enrolment) and/or `releaseAt` (fixed calendar date, opens at 00:00 UTC of that day; DATE column without time). With both, the
 * unit opens when both are met. NULL = no restriction (every existing unit stays open). Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable(TABLE);
    if (!columns.releaseAfterDays) await q.addColumn(TABLE, 'releaseAfterDays', { type: S.INTEGER, allowNull: true });
    if (!columns.releaseAt) await q.addColumn(TABLE, 'releaseAt', { type: S.DATEONLY, allowNull: true });
  },

  async down(q) {
    const columns = await q.describeTable(TABLE);
    if (columns.releaseAfterDays || columns.releaseAt) {
      const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM units WHERE releaseAfterDays IS NOT NULL OR releaseAt IS NOT NULL');
      if (Number(total) > 0 && process.env.CONFIRM_UNIT_RELEASE_DATA_LOSS !== 'yes') {
        throw new Error('Units with a release rule exist; export them and set CONFIRM_UNIT_RELEASE_DATA_LOSS=yes before rollback');
      }
    }
    for (const name of ['releaseAt', 'releaseAfterDays']) {
      if (columns[name]) await q.removeColumn(TABLE, name);
    }
  }
};
