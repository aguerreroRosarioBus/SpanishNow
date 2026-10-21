'use strict';

/**
 * Embedded video links: courses.introVideoUrl (welcome video) and stories.videoUrl (lesson video).
 * The server stores the normalised embed URL (YouTube, Vimeo or Bunny); we never host video.
 * Safe to re-run: every step checks the current schema first.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const courses = await queryInterface.describeTable('courses');
    if (!courses.introVideoUrl) await queryInterface.addColumn('courses', 'introVideoUrl', { type: Sequelize.STRING(500), allowNull: true });
    const stories = await queryInterface.describeTable('stories');
    if (!stories.videoUrl) await queryInterface.addColumn('stories', 'videoUrl', { type: Sequelize.STRING(500), allowNull: true });
  },

  async down(queryInterface) {
    const [[courses]] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'introVideoUrl'"
    );
    const [[stories]] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stories' AND COLUMN_NAME = 'videoUrl'"
    );
    if (Number(courses.total) && Number(stories.total)) {
      const [[{ total }]] = await queryInterface.sequelize.query(
        'SELECT (SELECT COUNT(*) FROM courses WHERE introVideoUrl IS NOT NULL) + (SELECT COUNT(*) FROM stories WHERE videoUrl IS NOT NULL) AS total'
      );
      if (Number(total) > 0 && process.env.CONFIRM_VIDEO_URLS_DATA_LOSS !== 'yes') {
        throw new Error('Courses or stories with a video link exist; export them and set CONFIRM_VIDEO_URLS_DATA_LOSS=yes before rollback');
      }
    }
    if (Number(courses.total)) await queryInterface.removeColumn('courses', 'introVideoUrl');
    if (Number(stories.total)) await queryInterface.removeColumn('stories', 'videoUrl');
  }
};
