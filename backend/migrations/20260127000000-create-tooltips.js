'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tooltips', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      targetType: {
        type: Sequelize.ENUM('story', 'question'),
        allowNull: false,
        comment: 'Type of content this tooltip belongs to',
        field: 'targetType'
      },
      targetId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'ID of the story or question',
        field: 'targetId'
      },
      startOffset: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Character offset where tooltip starts (0-indexed)',
        field: 'startOffset'
      },
      endOffset: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Character offset where tooltip ends (0-indexed)',
        field: 'endOffset'
      },
      selectedText: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Original text that was selected (for validation)',
        field: 'selectedText'
      },
      tooltipContent: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Explanation/translation shown in tooltip',
        field: 'tooltipContent'
      },
      createdBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        comment: 'Teacher who created this tooltip',
        field: 'createdBy'
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Set to false if text changed and tooltip is invalid',
        field: 'isActive'
      },
      highlightColor: {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: 'yellow',
        comment: 'Color for highlighting: yellow, blue, green, pink',
        field: 'highlightColor'
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
    await queryInterface.addIndex('tooltips', ['targetType', 'targetId'], {
      name: 'idx_tooltip_target'
    });
    await queryInterface.addIndex('tooltips', ['createdBy'], {
      name: 'idx_tooltip_creator'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('tooltips');
  }
};
