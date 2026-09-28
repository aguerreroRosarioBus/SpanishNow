const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Tooltip = sequelize.define('Tooltip', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // Polymorphic relationship - can belong to Story OR Question
  targetType: {
    type: DataTypes.ENUM('story', 'question'),
    allowNull: false,
    comment: 'Type of content this tooltip belongs to'
  },
  targetId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID of the story or question'
  },

  // Position and validation
  startOffset: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Character offset where tooltip starts (0-indexed)'
  },
  endOffset: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Character offset where tooltip ends (0-indexed)'
  },
  selectedText: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Original text that was selected (for validation)'
  },

  // Tooltip content
  tooltipContent: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Explanation/translation shown in tooltip'
  },

  // Metadata
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'Teacher who created this tooltip'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Set to false if text changed and tooltip is invalid'
  },
  highlightColor: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'yellow',
    comment: 'Color for highlighting: yellow, blue, green, pink'
  }
}, {
  timestamps: true,
  tableName: 'tooltips',
  indexes: [
    {
      fields: ['targetType', 'targetId'],
      name: 'idx_tooltip_target'
    },
    {
      fields: ['createdBy'],
      name: 'idx_tooltip_creator'
    }
  ]
});

module.exports = Tooltip;
