// DEPRECATED: superseded by the migration runner (docs/database.md).
//   npm run db:migrate:adopt   register what an existing database already contains
//   npm run db:migrate         apply the pending migrations
// This wrapper keeps `npm run db:migrate:tprs:test` working: it still insists on an explicit, isolated test database
// (DB_NAME_TEST) and then does exactly "adopt + up" with the runner, in the same order as before.
require('dotenv').config({ quiet: true });
const productionName = process.env.DB_NAME || 'spanishnow';
const testName = process.env.DB_NAME_TEST;
if (!testName || testName === productionName || !/(test|tprs)/i.test(testName)) {
  throw new Error('Set DB_NAME_TEST to an existing isolated test database distinct from DB_NAME');
}
process.env.DB_NAME = testName;
console.warn('db:migrate:tprs:test is deprecated: use `DB_NAME=<db> npm run db:migrate:adopt` and `npm run db:migrate`.');
const sequelize = require('../config/database');
const { createMigrator, adopt } = require('../db/migrator');

(async () => {
  try {
    await sequelize.authenticate();
    const migrator = await createMigrator(sequelize);
    await adopt(migrator);
    // Refuses to drop non-empty legacy tables unless CONFIRM_DROP_LEGACY_PROGRESS=yes is set in the environment.
    await migrator.umzug.up();
    console.log(`Migrations applied to isolated database ${testName}`);
  } finally {
    await sequelize.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
