// Runs in every test file before any app module is loaded.
process.env.DOTENV_CONFIG_QUIET = 'true'; // silences dotenv's banner also when src/app.js loads it
require('dotenv').config(); // DB credentials only; DB_NAME is overridden below
const { TEST_DB_NAME, assertSafeTestDatabase } = require('./helpers/testEnv');

process.env.NODE_ENV = 'test';
process.env.DB_NAME = TEST_DB_NAME;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'jest-secret';
assertSafeTestDatabase(process.env.DB_NAME);

// Selling courses: tests never reach Stripe or an SMTP server, whatever backend/.env says.
process.env.PAYMENTS_FAKE = '0';
process.env.MAIL_TRANSPORT = 'log';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_jest';
delete process.env.STRIPE_SECRET_KEY;
