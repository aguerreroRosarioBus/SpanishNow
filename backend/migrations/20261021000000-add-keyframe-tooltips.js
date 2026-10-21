'use strict';

const TABLE = 'tooltips';
const INDEX = 'idx_tooltip_keyframe';

/**
 * Tooltips anchored to a keyframe of a lesson plan:
 * targetType='keyframe', targetId=storyId, blockKey=keyframe blockKey,
 * startOffset/endOffset relative to the keyframe text.
 * Safe to re-run: every step checks the current schema first.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable(TABLE);

    await queryInterface.changeColumn(TABLE, 'targetType', {
      type: Sequelize.ENUM('story', 'question', 'keyframe'),
      allowNull: false,
      comment: 'Type of content this tooltip belongs to'
    });

    if (!columns.blockKey) {
      await queryInterface.addColumn(TABLE, 'blockKey', {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'blockKey of the keyframe (targetType=keyframe only)'
      });
    }

    const indexes = await queryInterface.showIndex(TABLE);
    if (!indexes.some(index => index.name === INDEX)) {
      await queryInterface.addIndex(TABLE, ['targetId', 'blockKey'], { name: INDEX });
    }
  },

  async down(queryInterface, Sequelize) {
    const [[{ total }]] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS total FROM tooltips WHERE targetType = 'keyframe'"
    );
    if (Number(total) > 0) {
      if (process.env.CONFIRM_KEYFRAME_TOOLTIP_DATA_LOSS !== 'yes') {
        throw new Error('Export keyframe tooltips and set CONFIRM_KEYFRAME_TOOLTIP_DATA_LOSS=yes before rollback');
      }
      await queryInterface.sequelize.query("DELETE FROM tooltips WHERE targetType = 'keyframe'");
    }

    const indexes = await queryInterface.showIndex(TABLE);
    if (indexes.some(index => index.name === INDEX)) await queryInterface.removeIndex(TABLE, INDEX);

    const columns = await queryInterface.describeTable(TABLE);
    if (columns.blockKey) await queryInterface.removeColumn(TABLE, 'blockKey');

    await queryInterface.changeColumn(TABLE, 'targetType', {
      type: Sequelize.ENUM('story', 'question'),
      allowNull: false,
      comment: 'Type of content this tooltip belongs to'
    });
  }
};
