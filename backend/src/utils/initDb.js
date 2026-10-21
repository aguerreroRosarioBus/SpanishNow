// DEVELOPMENT ONLY. Creates/alters tables from the Sequelize models with sync({ alter: true }).
// It does not know about migrations (no SequelizeMeta, no lesson-plan backfill, no data conversion) and can alter
// columns in place. For anything that must be reproducible, or any shared/remote database, use the runner:
//   npm run db:migrate   (and docs/database.md)
require('dotenv').config();
const sequelize = require('../config/database');
const models = require('../models');

async function initDatabase() {
  try {
    const { host, database } = sequelize.config;
    console.warn(`⚠️  db:init is for local development only (sync({ alter: true })). Prefer "npm run db:migrate".`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('db:init refuses to run with NODE_ENV=production; use "npm run db:migrate"');
    }
    if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.ALLOW_DB_INIT_REMOTE !== 'yes') {
      throw new Error(`db:init refuses the non-local host "${host}" (database "${database}"); set ALLOW_DB_INIT_REMOTE=yes only if you are sure`);
    }
    console.log('🔄 Initializing database...');

    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync all models with database
    await sequelize.sync({ alter: true });
    console.log('✅ All models synchronized successfully');

    console.log('\n🎉 Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

initDatabase();
