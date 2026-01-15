const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ActivityConfig = sequelize.define('ActivityConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  unitId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'units',
      key: 'id'
    },
    comment: 'Foreign key to units table'
  },
  activityType: {
    type: DataTypes.ENUM('flashcards', 'questions', 'matching', 'listen_repeat'),
    allowNull: false,
    comment: 'Type of activity: flashcards, questions, matching, or listen_repeat'
  },
  isEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this activity is enabled for the unit'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Display order of the activity (0-indexed)'
  },
  requiredStoryIds: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: 'Array of story IDs that must be completed before this activity is accessible'
  }
}, {
  timestamps: true,
  tableName: 'activity_configs',
  indexes: [
    {
      fields: ['unitId'],
      name: 'idx_activity_configs_unit'
    },
    {
      fields: ['order'],
      name: 'idx_activity_configs_order'
    },
    {
      unique: true,
      fields: ['unitId', 'activityType'],
      name: 'unique_unit_activity'
    }
  ]
});

module.exports = ActivityConfig;
