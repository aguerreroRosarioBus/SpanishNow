'use strict';

// Removes the pre-TPRS progress system now replaced by lesson_progress / lesson_answers / lesson_reinforcements:
//   tables progress, question_responses, activity_configs
//   enrollments.questionsCompleted / flashcardsCompleted / matchingCompleted / listenRepeatCompleted
// activity_configs is read by 20260927000000-create-lesson-plans to generate the reinforcement blocks, so this
// migration must run after it. Data is not backed up here: `up` refuses to run on non-empty legacy tables unless
// CONFIRM_DROP_LEGACY_PROGRESS=yes is set (take a database backup first). `down` recreates the empty structure only.

const TABLES = ['question_responses', 'progress', 'activity_configs']; // drop order: question_responses references progress
const ENROLLMENT_FLAGS = ['questionsCompleted', 'flashcardsCompleted', 'matchingCompleted', 'listenRepeatCompleted'];

async function existingTables(q) {
  const tables = await q.showAllTables();
  return new Set(tables.map(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase()));
}

module.exports = {
  async up(q) {
    const present = await existingTables(q);
    const counts = {};
    for (const table of TABLES) {
      if (!present.has(table)) continue;
      const [[row]] = await q.sequelize.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      counts[table] = Number(row.total);
    }
    const withRows = Object.entries(counts).filter(([, total]) => total > 0);
    if (withRows.length && process.env.CONFIRM_DROP_LEGACY_PROGRESS !== 'yes') {
      throw new Error(
        `Refusing to drop legacy progress tables with data (${withRows.map(([t, n]) => `${t}: ${n} rows`).join(', ')}). ` +
        'Back up the database and rerun with CONFIRM_DROP_LEGACY_PROGRESS=yes.'
      );
    }

    for (const table of TABLES) {
      if (present.has(table)) await q.dropTable(table);
    }

    if (present.has('enrollments')) {
      const columns = await q.describeTable('enrollments');
      for (const column of ENROLLMENT_FLAGS) {
        if (columns[column]) await q.removeColumn('enrollments', column);
      }
    }
  },

  // Structure only: the dropped data is not recoverable from here.
  async down(q, S) {
    const present = await existingTables(q);
    const dates = { createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false } };
    const flag = { type: S.BOOLEAN, allowNull: false, defaultValue: false };

    if (present.has('enrollments')) {
      const columns = await q.describeTable('enrollments');
      for (const column of ENROLLMENT_FLAGS) {
        if (!columns[column]) await q.addColumn('enrollments', column, { ...flag });
      }
    }

    if (!present.has('activity_configs')) {
      await q.createTable('activity_configs', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        storyId: { type: S.INTEGER, allowNull: false, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE' },
        activityType: { type: S.ENUM('questions', 'flashcards', 'matching', 'listen_repeat'), allowNull: false },
        order: { type: S.INTEGER, allowNull: false },
        isEnabled: { type: S.BOOLEAN, defaultValue: true },
        requiredStoryIds: { type: S.JSON, defaultValue: null },
        ...dates
      });
      await q.addIndex('activity_configs', ['storyId'], { name: 'idx_activity_configs_story' });
      await q.addIndex('activity_configs', ['order'], { name: 'idx_activity_configs_order' });
      await q.addIndex('activity_configs', ['storyId', 'activityType'], { name: 'unique_story_activity', unique: true });
    }

    if (!present.has('progress')) {
      await q.createTable('progress', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        enrollmentId: { type: S.INTEGER, allowNull: false, references: { model: 'enrollments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        storyId: { type: S.INTEGER, allowNull: false, references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        completed: { ...flag },
        activitiesCompleted: { ...flag },
        flashcardsViewed: { ...flag },
        questionsCompleted: { ...flag },
        matchingCompleted: { ...flag },
        listenRepeatCompleted: { ...flag },
        ...dates
      });
    }

    if (!present.has('question_responses')) {
      await q.createTable('question_responses', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        progressId: { type: S.INTEGER, allowNull: false, references: { model: 'progress', key: 'id' }, onDelete: 'CASCADE' },
        questionId: { type: S.INTEGER, allowNull: false, references: { model: 'questions', key: 'id' }, onDelete: 'CASCADE' },
        studentAnswer: { type: S.STRING(200), allowNull: false },
        isCorrect: { type: S.BOOLEAN, allowNull: false },
        ...dates
      });
      await q.addIndex('question_responses', ['progressId', 'questionId'], { name: 'unique_progress_question', unique: true });
    }
  }
};
