// Close the Sequelize pool after each test file so Jest exits cleanly.
afterAll(async () => {
  await require('../src/config/database').close();
});
