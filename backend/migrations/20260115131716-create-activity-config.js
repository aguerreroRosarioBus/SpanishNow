'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('activity_configs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      unitId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'units',
          key: 'id'
        },
        onDelete: 'CASCADE',
        field: 'unitId'
      },
      activityType: {
        type: Sequelize.ENUM('questions', 'flashcards', 'matching', 'listen_repeat'),
        allowNull: false,
        field: 'activityType'
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      isEnabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        field: 'isEnabled'
      },
      requiredStoryIds: {
        type: Sequelize.JSON,
        defaultValue: [],
        field: 'requiredStoryIds'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'createdAt'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'updatedAt'
      }
    });

    // Add indexes
    await queryInterface.addIndex('activity_configs', ['unitId']);
    await queryInterface.addIndex('activity_configs', ['unitId', 'order']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('activity_configs');
  }
};
