const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('LessonPlan', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  storyId: { type: DataTypes.INTEGER, allowNull: false },
  revision: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false },
  audioSlowUrl: { type: DataTypes.STRING(500), allowNull: true },
  audioNormalUrl: { type: DataTypes.STRING(500), allowNull: true }
}, { tableName: 'lesson_plans', timestamps: true });
