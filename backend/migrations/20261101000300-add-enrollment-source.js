'use strict';

const TABLE = 'enrollments';
const UNIQUE_INDEX = 'enrollments_student_course_unique';

/**
 * How a student got access (`source`), the order that paid for it (`orderId`) and a unique (studentId, courseId).
 * Existing enrollments become 'free'. Fails, without changing anything, if a student is enrolled twice in a course:
 * those rows carry progress and need a human decision. Safe to re-run.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const indexes = await queryInterface.showIndex(TABLE);
    if (!indexes.some(index => index.name === UNIQUE_INDEX)) {
      const [duplicates] = await sequelize.query(
        'SELECT studentId, courseId, COUNT(*) AS total FROM enrollments GROUP BY studentId, courseId HAVING COUNT(*) > 1'
      );
      if (duplicates.length) {
        const list = duplicates.map(d => `student ${d.studentId} / course ${d.courseId} (${d.total} rows)`).join(', ');
        throw new Error(`Duplicate enrollments block the unique index; merge or delete them first: ${list}`);
      }
    }

    const columns = await queryInterface.describeTable(TABLE);
    if (!columns.source) {
      await queryInterface.addColumn(TABLE, 'source', {
        type: Sequelize.ENUM('free', 'purchase', 'manual', 'hotmart_import'), allowNull: false, defaultValue: 'free'
      });
    }
    if (!columns.orderId) {
      await queryInterface.addColumn(TABLE, 'orderId', {
        type: Sequelize.INTEGER, allowNull: true, references: { model: 'orders', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE'
      });
    }
    if (!indexes.some(index => index.name === UNIQUE_INDEX)) {
      await queryInterface.addIndex(TABLE, ['studentId', 'courseId'], { name: UNIQUE_INDEX, unique: true });
    }
    // The composite index now serves the studentId foreign key, so a lone studentId index (present in databases restored
    // from the dump) is redundant. Dropping it keeps every path to the same schema.
    for (const index of await queryInterface.showIndex(TABLE)) {
      if (index.name !== UNIQUE_INDEX && !index.primary && !index.unique && index.fields.length === 1 && index.fields[0].attribute === 'studentId') {
        await queryInterface.removeIndex(TABLE, index.name);
      }
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable(TABLE);
    if (columns.source) {
      const [[{ total }]] = await queryInterface.sequelize.query("SELECT COUNT(*) AS total FROM enrollments WHERE source <> 'free'");
      if (Number(total) > 0 && process.env.CONFIRM_ENROLLMENT_SOURCE_DATA_LOSS !== 'yes') {
        throw new Error('Enrollments from purchases, imports or manual grants exist; export them and set CONFIRM_ENROLLMENT_SOURCE_DATA_LOSS=yes before rollback');
      }
    }
    const indexes = await queryInterface.showIndex(TABLE);
    if (indexes.some(index => index.name === UNIQUE_INDEX)) {
      // MySQL may have dropped the foreign key's own index when the composite one was created; keep studentId indexed.
      const leadsWithStudent = index => index.name !== UNIQUE_INDEX && index.fields[0].attribute === 'studentId';
      if (!indexes.some(leadsWithStudent)) await queryInterface.addIndex(TABLE, ['studentId'], { name: 'studentId' });
      if (!indexes.some(index => index.name !== UNIQUE_INDEX && index.fields[0].attribute === 'courseId')) {
        await queryInterface.addIndex(TABLE, ['courseId'], { name: 'courseId' });
      }
      await queryInterface.removeIndex(TABLE, UNIQUE_INDEX);
    }
    if (columns.orderId) {
      const references = await queryInterface.getForeignKeyReferencesForTable(TABLE);
      for (const reference of references.filter(r => r.columnName === 'orderId')) {
        await queryInterface.removeConstraint(TABLE, reference.constraintName);
      }
      await queryInterface.removeColumn(TABLE, 'orderId');
    }
    if (columns.source) await queryInterface.removeColumn(TABLE, 'source');
  }
};
