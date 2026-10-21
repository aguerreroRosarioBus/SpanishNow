const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('LessonReinforcement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonProgressId: { type: DataTypes.INTEGER, allowNull: false },
  blockKey: { type: DataTypes.UUID, allowNull: false },
  completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { tableName: 'lesson_reinforcements', timestamps: true });
