const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RepetitionActivity = sequelize.define('RepetitionActivity', {
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
    }
  },
  phrase: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Spanish phrase to repeat'
  },
  audioUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL to model pronunciation audio'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Display order within the story'
  }
}, {
  timestamps: true,
  tableName: 'repetition_activities'
});

module.exports = RepetitionActivity;
