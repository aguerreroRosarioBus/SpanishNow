const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('LessonProgress', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  enrollmentId: { type: DataTypes.INTEGER, allowNull: false },
  storyId: { type: DataTypes.INTEGER, allowNull: false },
  planId: { type: DataTypes.INTEGER, allowNull: false },
  lastBlockKey: { type: DataTypes.UUID, allowNull: true },
  narrativeCompleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { tableName: 'lesson_progress', timestamps: true });
