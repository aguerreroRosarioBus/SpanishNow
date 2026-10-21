// Migration runner built on umzug (v3). It stores history in the SequelizeMeta table, with the file
// name as key, exactly like sequelize-cli, so both tools can share one database.
//
// Used by src/db/migrate.js (CLI), tests/globalSetup.js and the schema test. It never opens its own
// connection: the caller passes the Sequelize instance it wants to migrate.
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const { Sequelize } = require('sequelize');
const { adoptChecks, createInspector } = require('./adoptChecks');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'migrations');

/**
 * The dump was taken on Windows, where the table is called `sequelizemeta`; sequelize-cli uses
 * `SequelizeMeta`. On a case-sensitive server (Linux/Railway) those are different tables, so reuse
 * whichever one already exists and default to `SequelizeMeta` otherwise.
 */
async function resolveMetaTable(sequelize) {
  const [rows] = await sequelize.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'sequelizemeta' ORDER BY (TABLE_NAME = 'SequelizeMeta') DESC"
  );
  return rows.length ? rows[0].name : 'SequelizeMeta';
}

const consoleLogger = {
  info: entry => {
    if (entry && entry.event) {
      const seconds = entry.durationSeconds !== undefined ? ` (${entry.durationSeconds}s)` : '';
      console.log(`  ${entry.event.padEnd(10)} ${entry.name || ''}${seconds}`);
    } else console.log(entry);
  },
  warn: entry => console.warn(entry),
  error: entry => console.error(entry),
  debug: () => {}
};

async function createMigrator(sequelize, { logger = consoleLogger } = {}) {
  const metaTable = await resolveMetaTable(sequelize);
  const storage = new SequelizeStorage({ sequelize, tableName: metaTable });
  const queryInterface = sequelize.getQueryInterface();
  const umzug = new Umzug({
    migrations: {
      glob: ['*.js', { cwd: MIGRATIONS_DIR }],
      resolve: ({ name, path: file }) => {
        const migration = require(file);
        return {
          name,
          up: async () => migration.up(queryInterface, Sequelize),
          down: async () => {
            if (typeof migration.down !== 'function') throw new Error(`${name} has no down()`);
            return migration.down(queryInterface, Sequelize);
          }
        };
      }
    },
    context: queryInterface,
    storage,
    logger
  });
  return { umzug, storage, metaTable, sequelize };
}

/** { executed: [name], pending: [name] } */
async function status(migrator) {
  const executed = (await migrator.umzug.executed()).map(m => m.name);
  const pending = (await migrator.umzug.pending()).map(m => m.name);
  return { executed, pending };
}

/**
 * Registers in SequelizeMeta the migrations whose effect is ALREADY present in the schema (a database
 * restored from Dump20260122.sql, or one patched by hand with the old scripts), detecting it from
 * information_schema instead of assuming it. Nothing else is touched: the schema is not modified.
 * Returns one row per migration: { name, state: 'recorded' | 'adopted' | 'pending', evidence }.
 */
async function adopt(migrator, { dryRun = false } = {}) {
  const { executed, pending } = await status(migrator);
  const recorded = new Set(executed);
  const inspector = await createInspector(migrator.sequelize);
  const report = executed.map(name => ({ name, state: 'recorded', evidence: 'already in ' + migrator.metaTable }));
  const warnings = [];
  let firstPending = null;

  for (const name of pending) {
    const check = adoptChecks[name];
    let result = { applied: false, evidence: 'no adoption check for this migration; it will run' };
    if (check) result = await check(inspector);
    if (result.applied) {
      if (firstPending) warnings.push(`${name} looks applied although the earlier ${firstPending} is pending; it will run out of order`);
      if (!dryRun) await migrator.storage.logMigration({ name });
      recorded.add(name);
      report.push({ name, state: 'adopted', evidence: result.evidence });
    } else {
      if (!firstPending) firstPending = name;
      report.push({ name, state: 'pending', evidence: result.evidence });
    }
  }
  report.sort((a, b) => a.name.localeCompare(b.name));
  return { report, warnings, dryRun };
}

module.exports = { MIGRATIONS_DIR, resolveMetaTable, createMigrator, status, adopt };
