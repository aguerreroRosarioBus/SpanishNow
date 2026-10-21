'use strict';

const hasTable = async (q, name) => (await q.showAllTables()).some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === name);

/**
 * Unit quizzes: one quiz per unit (unique unitId), multiple-choice questions and the student's attempts.
 * Attempts die with their enrolment and with their quiz. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    if (!(await hasTable(q, 'unit_quizzes'))) {
      await q.createTable('unit_quizzes', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        unitId: { type: S.INTEGER, allowNull: false, references: { model: 'units', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        title: { type: S.STRING(200), allowNull: false },
        passingScore: { type: S.INTEGER, allowNull: false, defaultValue: 70 },
        isPublished: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    if (!(await q.showIndex('unit_quizzes')).some(index => index.name === 'unit_quizzes_unit_unique')) {
      await q.addIndex('unit_quizzes', ['unitId'], { name: 'unit_quizzes_unit_unique', unique: true });
    }

    if (!(await hasTable(q, 'unit_quiz_questions'))) {
      await q.createTable('unit_quiz_questions', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        quizId: { type: S.INTEGER, allowNull: false, references: { model: 'unit_quizzes', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        order: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        prompt: { type: S.TEXT, allowNull: false },
        options: { type: S.JSON, allowNull: false },
        correctIndex: { type: S.INTEGER, allowNull: false },
        explanation: { type: S.TEXT, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    if (!(await q.showIndex('unit_quiz_questions')).some(index => index.name === 'unit_quiz_questions_quiz_order')) {
      await q.addIndex('unit_quiz_questions', ['quizId', 'order'], { name: 'unit_quiz_questions_quiz_order' });
    }

    if (!(await hasTable(q, 'unit_quiz_attempts'))) {
      await q.createTable('unit_quiz_attempts', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        quizId: { type: S.INTEGER, allowNull: false, references: { model: 'unit_quizzes', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        enrollmentId: { type: S.INTEGER, allowNull: false, references: { model: 'enrollments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        answers: { type: S.JSON, allowNull: false },
        score: { type: S.INTEGER, allowNull: false },
        passed: { type: S.BOOLEAN, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    if (!(await q.showIndex('unit_quiz_attempts')).some(index => index.name === 'unit_quiz_attempts_enrollment_quiz')) {
      await q.addIndex('unit_quiz_attempts', ['enrollmentId', 'quizId'], { name: 'unit_quiz_attempts_enrollment_quiz' });
    }
  },

  async down(q) {
    let total = 0;
    for (const table of ['unit_quizzes', 'unit_quiz_attempts']) {
      if (!(await hasTable(q, table))) continue;
      const [[row]] = await q.sequelize.query(`SELECT COUNT(*) AS total FROM ${table}`);
      total += Number(row.total);
    }
    if (total > 0 && process.env.CONFIRM_UNIT_QUIZZES_DATA_LOSS !== 'yes') {
      throw new Error('Unit quizzes or attempts exist; export them and set CONFIRM_UNIT_QUIZZES_DATA_LOSS=yes before rollback');
    }
    for (const table of ['unit_quiz_attempts', 'unit_quiz_questions', 'unit_quizzes']) {
      if (await hasTable(q, table)) await q.dropTable(table);
    }
  }
};
