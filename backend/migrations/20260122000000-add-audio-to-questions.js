'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('questions', 'audioUrl', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'URL for question audio file'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('questions', 'audioUrl');
  }
};
