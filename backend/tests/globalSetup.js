// Rebuilds the dedicated test database from scratch, following the production path:
//   1. load Dump20260122.sql (historic schema + sample data)
//   2. apply the migrations that came after the dump, with queryInterface
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  require('dotenv').config({ quiet: true });
  const { TEST_DB_NAME, assertSafeTestDatabase } = require('./helpers/testEnv');
  assertSafeTestDatabase(TEST_DB_NAME);
  if (TEST_DB_NAME === process.env.DB_NAME) throw new Error('Test database must differ from DB_NAME');

  const mysql = require('mysql2/promise');
  const { Sequelize } = require('sequelize');
  const connection = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  };

  const admin = await mysql.createConnection(connection);
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
    await admin.query(`CREATE DATABASE \`${TEST_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.end();
  }

  const backend = path.resolve(__dirname, '..');
  const loader = await mysql.createConnection({ ...connection, database: TEST_DB_NAME, multipleStatements: true });
  try {
    await loader.query(fs.readFileSync(path.join(backend, 'Dump20260122.sql'), 'utf8'));
  } finally {
    await loader.end();
  }

  // The dump carries legacy progress rows; dropping them is expected in this throwaway database.
  process.env.CONFIRM_DROP_LEGACY_PROGRESS = 'yes';
  const sequelize = new Sequelize(TEST_DB_NAME, connection.user, connection.password, {
    host: connection.host, dialect: 'mysql', logging: false
  });
  try {
    const qi = sequelize.getQueryInterface();
    for (const file of [
      '20260122000000-add-audio-to-questions.js',
      '20260127000000-create-tooltips.js',
      '20260926000000-convert-activity-configs-to-story.js',
      '20260927000000-create-lesson-plans.js',
      '20261021000000-add-keyframe-tooltips.js',
      '20261022000000-drop-legacy-progress.js'
    ]) {
      await require(path.join(backend, 'migrations', file)).up(qi, Sequelize);
    }
  } finally {
    delete process.env.CONFIRM_DROP_LEGACY_PROGRESS;
    await sequelize.close();
  }
};
