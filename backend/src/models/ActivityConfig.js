const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ActivityConfig = sequelize.define('ActivityConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  storyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stories',
      key: 'id'
    },
    comment: 'Foreign key to stories table'
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
    comment: 'Whether this activity is enabled for the story'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Display order of the activity (0-indexed)'
  }
}, {
  timestamps: true,
  tableName: 'activity_configs',
  indexes: [
    {
      fields: ['storyId'],
      name: 'idx_activity_configs_story'
    },
    {
      fields: ['order'],
      name: 'idx_activity_configs_order'
    },
    {
      unique: true,
      fields: ['storyId', 'activityType'],
      name: 'unique_story_activity'
    }
  ]
});

module.exports = ActivityConfig;
