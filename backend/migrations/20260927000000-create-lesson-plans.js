'use strict';

// Apply only with sequelize-cli against a backed-up, isolated database first.
// MySQL DDL commits implicitly. If backfill fails, fix the cause and rerun;
// existing plans are skipped, so completed stories are not duplicated.
const { randomUUID } = require('crypto');

module.exports = {
  async up(q, S) {
    const now = () => new Date();
    const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false };
    const fk = (table) => ({ type: S.INTEGER, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'CASCADE' });
    const dates = { createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false } };
    const tables = await q.showAllTables();
    const exists = (name) => tables.some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === name);

    if (!exists('lesson_plans')) await q.createTable('lesson_plans', {
      id, storyId: fk('stories'), revision: { type: S.INTEGER, allowNull: false },
      status: { type: S.ENUM('draft', 'published'), allowNull: false },
      audioSlowUrl: { type: S.STRING(500) }, audioNormalUrl: { type: S.STRING(500) }, ...dates
    });
    if (!exists('lesson_blocks')) await q.createTable('lesson_blocks', {
      id, planId: fk('lesson_plans'), blockKey: { type: S.UUID, allowNull: false },
      type: { type: S.ENUM('expression', 'keyframe', 'question', 'full_story', 'flashcards', 'matching', 'listen_repeat'), allowNull: false },
      phase: { type: S.ENUM('before', 'during', 'after', 'later'), allowNull: false },
      position: { type: S.INTEGER, allowNull: false }, active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      required: { type: S.BOOLEAN, allowNull: false, defaultValue: false }, text: { type: S.TEXT },
      audioUrl: { type: S.STRING(500) }, questionId: { type: S.INTEGER },
      contextBlockKey: { type: S.UUID }, vocabularyId: { type: S.INTEGER },
      vocabularyRole: { type: S.ENUM('target', 'support', 'revisit') }, revisitStoryId: { type: S.INTEGER },
      questionSnapshot: { type: S.JSON }, vocabularySnapshot: { type: S.JSON }, ...dates
    });
    if (!exists('lesson_progress')) await q.createTable('lesson_progress', {
      id, enrollmentId: fk('enrollments'), storyId: fk('stories'), planId: fk('lesson_plans'),
      lastBlockKey: { type: S.UUID }, narrativeCompleted: { type: S.BOOLEAN, allowNull: false, defaultValue: false }, ...dates
    });
    if (!exists('lesson_answers')) await q.createTable('lesson_answers', {
      id, lessonProgressId: fk('lesson_progress'), blockKey: { type: S.UUID, allowNull: false },
      questionId: { type: S.INTEGER, allowNull: false }, studentAnswer: { type: S.STRING(200), allowNull: false },
      isCorrect: { type: S.BOOLEAN, allowNull: false }, attempt: { type: S.INTEGER, allowNull: false }, ...dates
    });
    if (!exists('lesson_reinforcements')) await q.createTable('lesson_reinforcements', {
      id, lessonProgressId: fk('lesson_progress'), blockKey: { type: S.UUID, allowNull: false },
      completed: { type: S.BOOLEAN, allowNull: false, defaultValue: false }, ...dates
    });

    const indexes = [
      ['lesson_plans', ['storyId', 'revision'], 'lesson_plan_story_revision'],
      ['lesson_blocks', ['planId', 'blockKey'], 'lesson_block_key'],
      ['lesson_progress', ['enrollmentId', 'storyId'], 'lesson_progress_assignment'],
      ['lesson_answers', ['lessonProgressId', 'blockKey', 'attempt'], 'lesson_answer_attempt'],
      ['lesson_reinforcements', ['lessonProgressId', 'blockKey'], 'lesson_reinforcement_block']
    ];
    for (const [table, fields, name] of indexes) {
      const present = await q.showIndex(table);
      if (!present.some(index => index.name === name)) await q.addIndex(table, fields, { name, unique: true });
    }

    const sequelize = q.sequelize;
    const activityColumns = exists('activity_configs') ? await q.describeTable('activity_configs') : {};
    const [stories] = await sequelize.query('SELECT id, text, audioSlowUrl, audioNormalUrl FROM stories ORDER BY id');
    for (const story of stories) {
      await sequelize.transaction(async transaction => {
        const [existing] = await sequelize.query('SELECT id FROM lesson_plans WHERE storyId = :storyId LIMIT 1', {
          replacements: { storyId: story.id }, transaction
        });
        if (existing.length) return;
        const timestamp = now();
        // Sequelize 6/MySQL returns a scalar insertId for QueryInterface.bulkInsert.
        const planId = await q.bulkInsert('lesson_plans', [{ storyId: story.id, revision: 1, status: 'published',
          audioSlowUrl: story.audioSlowUrl, audioNormalUrl: story.audioNormalUrl, createdAt: timestamp, updatedAt: timestamp }], { transaction });
        if (!Number.isSafeInteger(planId) || planId <= 0) throw new Error('Expected MySQL insertId for lesson plan backfill');
        const key = randomUUID();
        const blocks = [
          { blockKey: key, type: 'keyframe', phase: 'during', position: 0, active: true, required: true, text: story.text },
          { blockKey: randomUUID(), type: 'full_story', phase: 'after', position: 1, active: true, required: false }
        ];
        const [questions] = await sequelize.query('SELECT id, questionText, answerType, options, correctAnswer, audioUrl FROM questions WHERE storyId = :storyId ORDER BY id', {
          replacements: { storyId: story.id }, transaction
        });
        for (const question of questions) blocks.push({
          blockKey: randomUUID(), type: 'question', phase: 'after', position: blocks.length,
          active: true, required: false, questionId: question.id, contextBlockKey: key,
          questionSnapshot: JSON.stringify({ questionText: question.questionText, answerType: question.answerType,
            options: typeof question.options === 'string' ? JSON.parse(question.options) : question.options,
            correctAnswer: question.correctAnswer, audioUrl: question.audioUrl })
        });
        const [configs] = activityColumns.storyId
          ? await sequelize.query('SELECT activityType, isEnabled FROM activity_configs WHERE storyId = :storyId ORDER BY `order`', {
            replacements: { storyId: story.id }, transaction
          }) : [[]];
        for (const config of configs) {
          if (config.isEnabled && ['flashcards', 'matching', 'listen_repeat'].includes(config.activityType)) blocks.push({
            blockKey: randomUUID(), type: config.activityType, phase: 'after', position: blocks.length,
            active: true, required: false
          });
        }
        await q.bulkInsert('lesson_blocks', blocks.map(block => ({
          planId, blockKey: block.blockKey, type: block.type, phase: block.phase,
          position: block.position, active: block.active, required: block.required,
          text: block.text || null, audioUrl: null, questionId: block.questionId || null,
          contextBlockKey: block.contextBlockKey || null, vocabularyId: null, vocabularyRole: null,
          revisitStoryId: null, questionSnapshot: block.questionSnapshot || null, vocabularySnapshot: null,
          createdAt: timestamp, updatedAt: timestamp
        })), { transaction });
      });
    }
  },

  async down(q) {
    if (process.env.CONFIRM_LESSON_PLAN_DATA_LOSS !== 'yes') {
      throw new Error('Export lesson_* tables and set CONFIRM_LESSON_PLAN_DATA_LOSS=yes before rollback');
    }
    for (const table of ['lesson_reinforcements', 'lesson_answers', 'lesson_progress', 'lesson_blocks', 'lesson_plans']) {
      await q.dropTable(table);
    }
  }
};
