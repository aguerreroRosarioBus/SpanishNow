'use strict';

const TABLE = 'courses';
const SLUG_INDEX = 'courses_slug_unique';

/**
 * Sales fields of a course: slug (public URL), price in cents, currency, isPublished and salesDescription.
 * Existing courses stay unpublished and free until the teacher changes them.
 * Safe to re-run: every step checks the current schema first.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable(TABLE);
    if (!columns.slug) await queryInterface.addColumn(TABLE, 'slug', { type: Sequelize.STRING(160), allowNull: true });
    if (!columns.price) await queryInterface.addColumn(TABLE, 'price', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    if (!columns.currency) await queryInterface.addColumn(TABLE, 'currency', { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'usd' });
    if (!columns.isPublished) await queryInterface.addColumn(TABLE, 'isPublished', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    if (!columns.salesDescription) await queryInterface.addColumn(TABLE, 'salesDescription', { type: Sequelize.TEXT, allowNull: true });

    const indexes = await queryInterface.showIndex(TABLE);
    if (!indexes.some(index => index.name === SLUG_INDEX)) {
      await queryInterface.addIndex(TABLE, ['slug'], { name: SLUG_INDEX, unique: true });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable(TABLE);
    if (columns.price && columns.isPublished) {
      const [[{ total }]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS total FROM courses WHERE price > 0 OR isPublished = 1 OR salesDescription IS NOT NULL'
      );
      if (Number(total) > 0 && process.env.CONFIRM_COURSE_SALES_DATA_LOSS !== 'yes') {
        throw new Error('Courses with price, publication or sales text exist; export them and set CONFIRM_COURSE_SALES_DATA_LOSS=yes before rollback');
      }
    }
    const indexes = await queryInterface.showIndex(TABLE);
    if (indexes.some(index => index.name === SLUG_INDEX)) await queryInterface.removeIndex(TABLE, SLUG_INDEX);
    for (const name of ['salesDescription', 'isPublished', 'currency', 'price', 'slug']) {
      if (columns[name]) await queryInterface.removeColumn(TABLE, name);
    }
  }
};
