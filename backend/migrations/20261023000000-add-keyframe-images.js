'use strict';

const TABLE = 'lesson_blocks';

/**
 * Illustration of a keyframe: imageUrl (uploaded file or exported drawing) and imageAlt (alternative text).
 * Safe to re-run: every step checks the current schema first.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable(TABLE);
    if (!columns.imageUrl) {
      await queryInterface.addColumn(TABLE, 'imageUrl', { type: Sequelize.STRING(500), allowNull: true });
    }
    if (!columns.imageAlt) {
      await queryInterface.addColumn(TABLE, 'imageAlt', { type: Sequelize.STRING(300), allowNull: true });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable(TABLE);
    if (columns.imageUrl) {
      const [[{ total }]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS total FROM lesson_blocks WHERE imageUrl IS NOT NULL OR imageAlt IS NOT NULL'
      );
      if (Number(total) > 0 && process.env.CONFIRM_KEYFRAME_IMAGE_DATA_LOSS !== 'yes') {
        throw new Error('Keyframe illustrations exist; export them and set CONFIRM_KEYFRAME_IMAGE_DATA_LOSS=yes before rollback');
      }
      await queryInterface.removeColumn(TABLE, 'imageUrl');
    }
    if (columns.imageAlt) await queryInterface.removeColumn(TABLE, 'imageAlt');
  }
};
