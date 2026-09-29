// Runs the TPRS migration only against an explicitly named isolated test DB.
require('dotenv').config();
const productionName = process.env.DB_NAME || 'spanishnow';
const testName = process.env.DB_NAME_TEST;
if (!testName || testName === productionName || !/(test|tprs)/i.test(testName)) {
  throw new Error('Set DB_NAME_TEST to an existing isolated test database distinct from DB_NAME');
}
process.env.DB_NAME = testName;
const sequelize = require('../config/database');
const activityConfigMigration = require('../../migrations/20260926000000-convert-activity-configs-to-story');
const migration = require('../../migrations/20260927000000-create-lesson-plans');

(async () => {
  try {
    await sequelize.authenticate();
    await activityConfigMigration.up(sequelize.getQueryInterface(), require('sequelize'));
    await migration.up(sequelize.getQueryInterface(), require('sequelize'));
    console.log(`TPRS migration applied to isolated database ${testName}`);
  } finally {
    await sequelize.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
