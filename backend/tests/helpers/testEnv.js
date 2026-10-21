// Single source of truth for the test database and the safety guard.
// The suite never touches the database named in backend/.env (DB_NAME).
const TEST_DB_NAME = 'spanishnow_jest_test';

function assertSafeTestDatabase(name) {
  if (!name || !/jest|test/i.test(name)) {
    throw new Error(`Refusing to run: database "${name}" does not look like a test database (must contain "jest" or "test")`);
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to run outside NODE_ENV=test');
  }
}

module.exports = { TEST_DB_NAME, assertSafeTestDatabase };
