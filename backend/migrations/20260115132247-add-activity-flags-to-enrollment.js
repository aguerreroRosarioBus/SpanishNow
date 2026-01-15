'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('enrollments', 'questionsCompleted', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });

    await queryInterface.addColumn('enrollments', 'flashcardsCompleted', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });

    await queryInterface.addColumn('enrollments', 'matchingCompleted', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });

    await queryInterface.addColumn('enrollments', 'listenRepeatCompleted', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('enrollments', 'questionsCompleted');
    await queryInterface.removeColumn('enrollments', 'flashcardsCompleted');
    await queryInterface.removeColumn('enrollments', 'matchingCompleted');
    await queryInterface.removeColumn('enrollments', 'listenRepeatCompleted');
  }
};
