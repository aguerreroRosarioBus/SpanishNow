// Migration CLI.   node src/db/migrate.js <command> [options]
//
//   up [--to <name>]        apply pending migrations (all, or up to and including <name>)
//   down --to <name>        revert, newest first, down to and including <name>
//   down --last             revert only the most recent migration
//   status                  list applied / pending migrations
//   adopt [--dry-run]       register migrations whose effect is already in the schema (see docs/database.md)
//
// Target: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME (backend/.env or the environment).
// Destructive migrations keep their own confirmation variables (CONFIRM_DROP_LEGACY_PROGRESS,
// CONFIRM_LESSON_PLAN_DATA_LOSS, CONFIRM_KEYFRAME_TOOLTIP_DATA_LOSS, CONFIRM_DROP_BASELINE).
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const sequelize = require('../config/database');
const { createMigrator, status, adopt } = require('./migrator');

const LOCK_NAME = 'spanishnow_migrations';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, flags: new Set(), values: {} };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'to') {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error('--to needs a migration name');
      options.values.to = rest[++i];
    } else options.flags.add(key);
  }
  return options;
}

const describeTarget = () => {
  const { host, port, database } = sequelize.config;
  return `${host}:${port}/${database}`;
};

/** One migration run at a time per database (e.g. two Railway replicas starting together). */
async function acquireLock() {
  const { host, port, username, password, database } = sequelize.config;
  const connection = await mysql.createConnection({ host, port, user: username, password, database });
  const [[row]] = await connection.query('SELECT GET_LOCK(?, 30) AS got', [LOCK_NAME]);
  if (row.got !== 1) {
    await connection.end();
    throw new Error('Another migration run holds the lock; try again when it finishes');
  }
  return async () => {
    try { await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]); } finally { await connection.end(); }
  };
}

function printAdoption({ report, warnings, dryRun }) {
  const label = { recorded: 'recorded', adopted: dryRun ? 'would adopt' : 'adopted', pending: 'pending' };
  for (const row of report) console.log(`  ${label[row.state].padEnd(12)} ${row.name}\n               ${row.evidence}`);
  for (const warning of warnings) console.warn(`  warning: ${warning}`);
  const adopted = report.filter(r => r.state === 'adopted').length;
  const pending = report.filter(r => r.state === 'pending').length;
  console.log(`\n${dryRun ? 'Dry run: nothing was written. ' : ''}${adopted} ${dryRun ? 'to adopt' : 'adopted'}, ${pending} pending` +
    (pending ? " (run 'npm run db:migrate' to apply them)." : '.'));
}

async function main() {
  const { command, flags, values } = parseArgs(process.argv.slice(2));
  if (!['up', 'down', 'status', 'adopt'].includes(command)) {
    throw new Error('Usage: migrate.js <up [--to name] | down (--to name | --last) | status | adopt [--dry-run]>');
  }
  console.log(`Database: ${describeTarget()}`);
  await sequelize.authenticate();
  const migrator = await createMigrator(sequelize);
  const { umzug } = migrator;

  if (command === 'status') {
    const { executed, pending } = await status(migrator);
    for (const name of executed) console.log(`  up       ${name}`);
    for (const name of pending) console.log(`  pending  ${name}`);
    console.log(`\n${executed.length} applied, ${pending.length} pending (history table: ${migrator.metaTable})`);
    return;
  }

  const release = await acquireLock();
  try {
    if (command === 'adopt') {
      printAdoption(await adopt(migrator, { dryRun: flags.has('dry-run') }));
    } else if (command === 'up') {
      const done = await umzug.up(values.to ? { to: values.to } : undefined);
      console.log(done.length ? `\n${done.length} migration(s) applied.` : 'Nothing to apply: the database is up to date.');
    } else {
      if (!values.to && !flags.has('last')) throw new Error('down needs --to <name> (reverts down to and including it) or --last');
      const done = await umzug.down(values.to ? { to: values.to } : undefined);
      console.log(done.length ? `\n${done.length} migration(s) reverted.` : 'Nothing to revert.');
    }
  } finally {
    await release();
  }
}

main()
  .then(() => sequelize.close())
  .catch(async error => {
    console.error(`\nMigration failed: ${error.message}`);
    process.exitCode = 1;
    await sequelize.close().catch(() => {});
  });
