const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Progress = sequelize.define('Progress', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  enrollmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'enrollments',
      key: 'id'
    }
  },
  storyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stories',
      key: 'id'
    }
  },
  completed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  timestamps: true,
  tableName: 'progress'
});

module.exports = Progress;
