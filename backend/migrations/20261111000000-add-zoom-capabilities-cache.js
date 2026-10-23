module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('external_connections');
    if (!columns.capabilities) await queryInterface.addColumn('external_connections', 'capabilities', { type: Sequelize.JSON, allowNull: true });
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('external_connections');
    if (columns.capabilities) await queryInterface.removeColumn('external_connections', 'capabilities');
  }
};
