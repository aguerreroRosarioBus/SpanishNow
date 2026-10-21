'use strict';

/**
 * Baseline: the tables that, until now, only existed in Dump20260122.sql (they were created by
 * sequelize.sync / by hand, never by a migration). It reproduces their state BEFORE the first
 * migration (20260115131716): the dump already contains the effect of 20260115131716 and
 * 20260115132247, so those two migrations still run on top of this baseline.
 *
 *   baseline + all migrations, in order  ==  Dump20260122.sql + adopt + all migrations
 *
 * Tables: users, courses, units, stories, questions (no audioUrl yet), vocabulary,
 * repetition_activities, enrollments (no activity flags yet) and the legacy progress / question_responses
 * (dropped again by 20261022000000-drop-legacy-progress).
 *
 * Safe on databases that already have the tables: each table is created only if it is missing, so
 * running it on a restored dump changes nothing. Legacy tables (progress, question_responses) are
 * only created on a completely empty database; on an existing one they are either already there or
 * were intentionally dropped.
 *
 * Existing databases that already hold these tables should be registered with `npm run db:migrate:adopt`
 * instead of replaying history.
 */

const CORE = ['users', 'courses', 'units', 'stories', 'questions', 'vocabulary', 'repetition_activities', 'enrollments'];
const COLLATE_DEFAULT = 'utf8mb4_0900_ai_ci'; // MySQL 8 default, the one the dump was taken with
const COLLATE_UNICODE = 'utf8mb4_unicode_ci';

async function tableNames(q) {
  const tables = await q.showAllTables();
  return new Set(tables.map(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase()));
}

module.exports = {
  CORE_TABLES: CORE,

  async up(q, S) {
    const present = await tableNames(q);
    const fresh = !CORE.some(name => present.has(name));
    const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false };
    const dates = { createdAt: { type: S.DATE, allowNull: false }, updatedAt: { type: S.DATE, allowNull: false } };
    const ref = (table, extra = {}) => ({
      type: S.INTEGER, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE', ...extra
    });
    const tableOptions = { engine: 'InnoDB', charset: 'utf8mb4', collate: COLLATE_DEFAULT };
    const create = async (name, attributes, options = tableOptions) => {
      if (present.has(name)) return false;
      await q.createTable(name, attributes, options);
      present.add(name);
      return true;
    };

    await create('users', {
      id,
      name: { type: S.STRING(100), allowNull: false },
      email: { type: S.STRING(100), allowNull: false, unique: true },
      password: { type: S.STRING(255), allowNull: false },
      role: { type: S.ENUM('teacher', 'student'), allowNull: false, defaultValue: 'student' },
      ...dates
    });

    await create('courses', {
      id,
      title: { type: S.STRING(200), allowNull: false },
      description: { type: S.TEXT },
      level: { type: S.ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2'), allowNull: false },
      teacherId: ref('users'),
      imageUrl: { type: S.STRING(500), allowNull: true },
      ...dates
    });

    await create('units', {
      id,
      courseId: ref('courses'),
      title: { type: S.STRING(200), allowNull: false },
      description: { type: S.TEXT },
      order: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      ...dates
    });

    await create('stories', {
      id,
      unitId: ref('units'),
      title: { type: S.STRING(200), allowNull: false },
      text: { type: S.TEXT, allowNull: false },
      audioSlowUrl: { type: S.STRING(500), allowNull: true, comment: 'URL for slow version audio' },
      audioNormalUrl: { type: S.STRING(500), allowNull: true, comment: 'URL for normal speed audio' },
      order: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      ...dates
    });

    await create('questions', {
      id,
      storyId: ref('stories'),
      questionText: { type: S.TEXT, allowNull: false },
      answerType: { type: S.ENUM('yes_no', 'choice'), allowNull: false, defaultValue: 'yes_no' },
      options: { type: S.JSON, allowNull: true, comment: 'Array of options for choice questions' },
      correctAnswer: { type: S.STRING(200), allowNull: false },
      ...dates
    });

    const createdVocabulary = await create('vocabulary', {
      id,
      unitId: ref('units'),
      word: { type: S.STRING(100), allowNull: false },
      translation: { type: S.STRING(100), allowNull: false },
      ...dates,
      example: { type: S.TEXT, comment: 'Example sentence using the word' },
      partOfSpeech: { type: S.STRING(50), allowNull: true, comment: 'noun, verb, adjective, adverb, etc.' },
      audioUrl: { type: S.STRING(500), allowNull: true, comment: 'URL to pronunciation audio file' },
      imageUrl: { type: S.STRING(500), allowNull: true, comment: 'URL to visual representation image' }
    });
    if (createdVocabulary) await q.addIndex('vocabulary', ['partOfSpeech'], { name: 'idx_vocabulary_part_of_speech' });

    // Timestamps are TIMESTAMP columns with server-side defaults in the dump (not DATETIME).
    const stamp = (suffix = '') => ({ type: 'TIMESTAMP', allowNull: true, defaultValue: q.sequelize.literal(`CURRENT_TIMESTAMP${suffix}`) });
    const createdRepetition = await create('repetition_activities', {
      id,
      storyId: { type: S.INTEGER, allowNull: false },
      phrase: { type: S.TEXT, allowNull: false, comment: 'Spanish phrase to repeat' },
      audioUrl: { type: S.STRING(500), allowNull: true, comment: 'URL to model pronunciation audio' },
      order: { type: S.INTEGER, allowNull: false, defaultValue: 0, comment: 'Display order within the story' },
      createdAt: stamp(),
      updatedAt: stamp(' ON UPDATE CURRENT_TIMESTAMP')
    }, { engine: 'InnoDB', charset: 'utf8mb4', collate: COLLATE_UNICODE });
    if (createdRepetition) {
      await q.addIndex('repetition_activities', ['storyId'], { name: 'idx_repetition_activities_story' });
      await q.addIndex('repetition_activities', ['order'], { name: 'idx_repetition_activities_order' });
      await q.addConstraint('repetition_activities', {
        type: 'foreign key', name: 'fk_repetition_activities_story', fields: ['storyId'],
        references: { table: 'stories', field: 'id' }, onDelete: 'CASCADE'
      });
    }

    await create('enrollments', {
      id,
      studentId: ref('users'),
      courseId: ref('courses'),
      ...dates
    });

    if (!fresh) return; // legacy tables only matter on a brand-new database (see header)

    const flag = (allowNull, extra = {}) => ({ type: S.BOOLEAN, allowNull, defaultValue: false, ...extra });
    await create('progress', {
      id,
      enrollmentId: ref('enrollments'),
      storyId: ref('stories'),
      completed: flag(false),
      ...dates,
      activitiesCompleted: flag(false),
      flashcardsViewed: flag(true),
      questionsCompleted: flag(true),
      matchingCompleted: flag(true),
      listenRepeatCompleted: flag(true)
    });

    const createdResponses = await create('question_responses', {
      id,
      progressId: { type: S.INTEGER, allowNull: false },
      questionId: { type: S.INTEGER, allowNull: false },
      studentAnswer: { type: S.STRING(200), allowNull: false },
      isCorrect: { type: S.BOOLEAN, allowNull: false },
      createdAt: stamp(),
      updatedAt: stamp(' ON UPDATE CURRENT_TIMESTAMP')
    }, { engine: 'InnoDB', charset: 'utf8mb4', collate: COLLATE_UNICODE });
    if (createdResponses) {
      await q.addIndex('question_responses', ['progressId', 'questionId'], { name: 'unique_progress_question', unique: true });
      await q.addIndex('question_responses', ['progressId'], { name: 'idx_question_responses_progress' });
      await q.addIndex('question_responses', ['questionId'], { name: 'idx_question_responses_question' });
      await q.addConstraint('question_responses', {
        type: 'foreign key', name: 'fk_question_responses_progress', fields: ['progressId'],
        references: { table: 'progress', field: 'id' }, onDelete: 'CASCADE'
      });
      await q.addConstraint('question_responses', {
        type: 'foreign key', name: 'fk_question_responses_question', fields: ['questionId'],
        references: { table: 'questions', field: 'id' }, onDelete: 'CASCADE'
      });
    }
  },

  // Destroys every content table. Never meant for a database with real data.
  async down(q) {
    if (process.env.CONFIRM_DROP_BASELINE !== 'yes') {
      throw new Error('Rolling back the baseline drops users, courses, units, stories, questions, vocabulary and enrollments. ' +
        'Back up the database and set CONFIRM_DROP_BASELINE=yes.');
    }
    const present = await tableNames(q);
    for (const name of ['question_responses', 'progress', 'enrollments', 'repetition_activities', 'vocabulary', 'questions', 'stories', 'units', 'courses', 'users']) {
      if (present.has(name)) await q.dropTable(name);
    }
  }
};
