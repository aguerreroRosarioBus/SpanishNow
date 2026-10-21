'use strict';

const TABLE = 'lesson_comments';

const hasTable = async q => (await q.showAllTables()).some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);

/**
 * Questions and answers of a lesson: a comment of the first level (parentId NULL) and its replies (one level only, enforced
 * by the API). Deleting the story, the author or the parent comment deletes the comment. `hidden` is the teacher's
 * moderation flag. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    if (!(await hasTable(q))) {
      await q.createTable(TABLE, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        storyId: { type: S.INTEGER, allowNull: false, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        userId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        parentId: { type: S.INTEGER, allowNull: true, references: { model: TABLE, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        body: { type: S.TEXT, allowNull: false },
        hidden: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        editedAt: { type: S.DATE, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = (await q.showIndex(TABLE)).map(index => index.name);
    if (!indexes.includes('lesson_comments_story_parent')) await q.addIndex(TABLE, ['storyId', 'parentId', 'createdAt'], { name: 'lesson_comments_story_parent' });
    if (!indexes.includes('lesson_comments_user_created')) await q.addIndex(TABLE, ['userId', 'createdAt'], { name: 'lesson_comments_user_created' });
  },

  async down(q) {
    if (!(await hasTable(q))) return;
    const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM lesson_comments');
    if (Number(total) > 0 && process.env.CONFIRM_COMMENTS_DATA_LOSS !== 'yes') {
      throw new Error('Lesson comments exist; export them and set CONFIRM_COMMENTS_DATA_LOSS=yes before rollback');
    }
    await q.dropTable(TABLE);
  }
};
