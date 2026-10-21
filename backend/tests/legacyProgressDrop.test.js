// Migration 20261022000000-drop-legacy-progress: schema after the migration and the data guard.
const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');
const sequelize = require('../src/config/database');
const migration = require('../migrations/20261022000000-drop-legacy-progress');

const FLAGS = ['questionsCompleted', 'flashcardsCompleted', 'matchingCompleted', 'listenRepeatCompleted'];
const SCRATCH_DB = 'spanishnow_jest_test_drop_legacy';
const tableNames = async qi => (await qi.showAllTables()).map(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase());

describe('drop-legacy-progress migration', () => {
  test('the migrated test database no longer has the legacy tables or enrollment flags, and keeps the TPRS ones', async () => {
    const qi = sequelize.getQueryInterface();
    const tables = await tableNames(qi);
    for (const gone of ['progress', 'question_responses', 'activity_configs']) expect(tables).not.toContain(gone);
    for (const kept of ['enrollments', 'lesson_plans', 'lesson_blocks', 'lesson_progress', 'lesson_answers', 'lesson_reinforcements', 'repetition_activities', 'vocabulary']) {
      expect(tables).toContain(kept);
    }
    const columns = await qi.describeTable('enrollments');
    for (const flag of FLAGS) expect(columns[flag]).toBeUndefined();
  });

  describe('up/down on a scratch database', () => {
    const connection = { host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' };
    let scratch; let qi; let previous;

    async function createLegacySchema() {
      await scratch.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of ['question_responses', 'progress', 'activity_configs', 'enrollments', 'stories', 'questions']) await scratch.query(`DROP TABLE IF EXISTS \`${t}\``);
      await scratch.query('SET FOREIGN_KEY_CHECKS = 1');
      await scratch.query('CREATE TABLE stories (id INT PRIMARY KEY AUTO_INCREMENT)');
      await scratch.query('CREATE TABLE questions (id INT PRIMARY KEY AUTO_INCREMENT)');
      await scratch.query(`CREATE TABLE enrollments (id INT PRIMARY KEY AUTO_INCREMENT,
        ${FLAGS.map(f => `\`${f}\` TINYINT(1) NOT NULL DEFAULT 0`).join(', ')})`);
      await scratch.query('CREATE TABLE progress (id INT PRIMARY KEY AUTO_INCREMENT, enrollmentId INT NOT NULL, storyId INT NOT NULL, FOREIGN KEY (enrollmentId) REFERENCES enrollments(id))');
      await scratch.query('CREATE TABLE question_responses (id INT PRIMARY KEY AUTO_INCREMENT, progressId INT NOT NULL, questionId INT NOT NULL, FOREIGN KEY (progressId) REFERENCES progress(id))');
      await scratch.query('CREATE TABLE activity_configs (id INT PRIMARY KEY AUTO_INCREMENT, storyId INT NOT NULL, FOREIGN KEY (storyId) REFERENCES stories(id))');
    }

    beforeAll(async () => {
      const admin = await mysql.createConnection(connection);
      try {
        await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH_DB}\``);
        await admin.query(`CREATE DATABASE \`${SCRATCH_DB}\` CHARACTER SET utf8mb4`);
      } finally { await admin.end(); }
      scratch = new Sequelize(SCRATCH_DB, connection.user, connection.password, { host: connection.host, dialect: 'mysql', logging: false });
      qi = scratch.getQueryInterface();
      previous = process.env.CONFIRM_DROP_LEGACY_PROGRESS;
    });

    afterAll(async () => {
      if (previous === undefined) delete process.env.CONFIRM_DROP_LEGACY_PROGRESS; else process.env.CONFIRM_DROP_LEGACY_PROGRESS = previous;
      await scratch.close();
      const admin = await mysql.createConnection(connection);
      try { await admin.query(`DROP DATABASE IF EXISTS \`${SCRATCH_DB}\``); } finally { await admin.end(); }
    });

    beforeEach(() => { delete process.env.CONFIRM_DROP_LEGACY_PROGRESS; });

    test('refuses to drop tables with rows without the confirmation, and changes nothing', async () => {
      await createLegacySchema();
      await scratch.query('INSERT INTO stories () VALUES ()');
      await scratch.query('INSERT INTO activity_configs (storyId) VALUES (1)');

      await expect(migration.up(qi, Sequelize)).rejects.toThrow(/CONFIRM_DROP_LEGACY_PROGRESS=yes/);
      process.env.CONFIRM_DROP_LEGACY_PROGRESS = 'si';
      await expect(migration.up(qi, Sequelize)).rejects.toThrow(/CONFIRM_DROP_LEGACY_PROGRESS=yes/);

      const tables = await tableNames(qi);
      expect(tables).toEqual(expect.arrayContaining(['progress', 'question_responses', 'activity_configs']));
      expect((await qi.describeTable('enrollments')).questionsCompleted).toBeDefined();
    });

    test('drops everything with the confirmation, is idempotent, and down recreates the empty structure', async () => {
      await createLegacySchema();
      await scratch.query('INSERT INTO stories () VALUES ()');
      await scratch.query('INSERT INTO activity_configs (storyId) VALUES (1)');
      process.env.CONFIRM_DROP_LEGACY_PROGRESS = 'yes';

      await migration.up(qi, Sequelize);
      await migration.up(qi, Sequelize); // already applied: no error

      const tables = await tableNames(qi);
      for (const gone of ['progress', 'question_responses', 'activity_configs']) expect(tables).not.toContain(gone);
      const columns = await qi.describeTable('enrollments');
      for (const flag of FLAGS) expect(columns[flag]).toBeUndefined();

      await migration.down(qi, Sequelize);
      expect(await tableNames(qi)).toEqual(expect.arrayContaining(['progress', 'question_responses', 'activity_configs']));
      const restored = await qi.describeTable('enrollments');
      for (const flag of FLAGS) expect(restored[flag]).toBeDefined();
      for (const t of ['progress', 'question_responses', 'activity_configs']) {
        const [[row]] = await scratch.query(`SELECT COUNT(*) AS total FROM \`${t}\``);
        expect(Number(row.total)).toBe(0);
      }
    });

    test('proceeds without confirmation when the legacy tables are empty', async () => {
      await createLegacySchema();
      await migration.up(qi, Sequelize);
      expect(await tableNames(qi)).not.toContain('progress');
    });
  });
});
