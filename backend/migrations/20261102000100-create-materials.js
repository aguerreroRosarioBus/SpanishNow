'use strict';

const TABLE = 'materials';

const hasTable = async q => (await q.showAllTables()).some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);

/**
 * Downloadable PDFs. A material belongs to a course, and optionally to one of its units or stories
 * (never both). Deleting the course, unit or story deletes its materials (the rows; the files in the
 * storage provider are removed by the API when it can). Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    if (!(await hasTable(q))) {
      await q.createTable(TABLE, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        courseId: { type: S.INTEGER, allowNull: false, references: { model: 'courses', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        unitId: { type: S.INTEGER, allowNull: true, references: { model: 'units', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        storyId: { type: S.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        title: { type: S.STRING(200), allowNull: false },
        fileUrl: { type: S.STRING(500), allowNull: false },
        providerPublicId: { type: S.STRING(300), allowNull: true },
        sizeBytes: { type: S.INTEGER, allowNull: false },
        order: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = (await q.showIndex(TABLE)).map(index => index.name);
    if (!indexes.includes('materials_course_order')) await q.addIndex(TABLE, ['courseId', 'order'], { name: 'materials_course_order' });
  },

  async down(q) {
    if (!(await hasTable(q))) return;
    const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM materials');
    if (Number(total) > 0 && process.env.CONFIRM_MATERIALS_DATA_LOSS !== 'yes') {
      throw new Error('Materials exist; export them and set CONFIRM_MATERIALS_DATA_LOSS=yes before rollback');
    }
    await q.dropTable(TABLE);
  }
};
