require('dotenv').config();
const sequelize = require('../config/database');
const models = require('../models');

async function initDatabase() {
  try {
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
