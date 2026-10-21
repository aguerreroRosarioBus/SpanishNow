// Rebuilds the dedicated test database from scratch following the upgrade path of a real, pre-existing database:
//   1. load Dump20260122.sql (historic schema + sample data, taken before the runner existed)
//   2. `adopt`: register what the dump already contains (baseline, 20260115*)
//   3. `up`: apply every remaining migration with the umzug runner (src/db/migrator.js)
//
// Why the dump and not an empty database: tests/legacyContent.test.js checks that real pre-TPRS content is converted by the
// migrations (backfilled revision 1, legacy progress dropped with data), which only exists in the dump. The other path,
// "empty database + migrations", is covered by tests/migrationRunner.test.js, which also proves both end in the same schema.
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
  const { createMigrator, adopt } = require('../src/db/migrator');
  const connection = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
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
    host: connection.host, port: connection.port, dialect: 'mysql', logging: false
  });
  try {
    const migrator = await createMigrator(sequelize, { logger: { info() {}, warn() {}, error() {}, debug() {} } });
    await adopt(migrator);
    await migrator.umzug.up();
  } finally {
    delete process.env.CONFIRM_DROP_LEGACY_PROGRESS;
    await sequelize.close();
  }
};
