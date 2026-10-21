'use strict';

const TABLE = 'courses';

const dropForeignKeysOf = async (q, column) => {
  const references = await q.getForeignKeyReferencesForTable(TABLE);
  for (const reference of references.filter(r => r.columnName === column)) {
    await q.removeConstraint(TABLE, reference.constraintName);
  }
};

/**
 * Series of courses: `nextCourseId` is the course offered after finishing this one and `nextCourseCouponId` the coupon
 * offered with it. Both are optional and are cleared (SET NULL) when the target is deleted. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable(TABLE);
    if (!columns.nextCourseId) {
      await q.addColumn(TABLE, 'nextCourseId', { type: S.INTEGER, allowNull: true, references: { model: 'courses', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    }
    if (!columns.nextCourseCouponId) {
      await q.addColumn(TABLE, 'nextCourseCouponId', { type: S.INTEGER, allowNull: true, references: { model: 'coupons', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    }
  },

  async down(q) {
    const columns = await q.describeTable(TABLE);
    if (columns.nextCourseId || columns.nextCourseCouponId) {
      const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM courses WHERE nextCourseId IS NOT NULL OR nextCourseCouponId IS NOT NULL');
      if (Number(total) > 0 && process.env.CONFIRM_COURSE_SERIES_DATA_LOSS !== 'yes') {
        throw new Error('Courses with a next course exist; export them and set CONFIRM_COURSE_SERIES_DATA_LOSS=yes before rollback');
      }
    }
    for (const name of ['nextCourseCouponId', 'nextCourseId']) {
      if (columns[name]) {
        await dropForeignKeysOf(q, name);
        await q.removeColumn(TABLE, name);
      }
    }
  }
};
