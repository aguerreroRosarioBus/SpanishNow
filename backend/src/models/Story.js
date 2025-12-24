const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Story = sequelize.define('Story', {
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
    }
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  audioSlowUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL for slow version audio'
  },
  audioNormalUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL for normal speed audio'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  timestamps: true,
  tableName: 'stories'
});

module.exports = Story;
