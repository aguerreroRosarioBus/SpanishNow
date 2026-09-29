const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('LessonAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonProgressId: { type: DataTypes.INTEGER, allowNull: false },
  blockKey: { type: DataTypes.UUID, allowNull: false },
  questionId: { type: DataTypes.INTEGER, allowNull: false },
  studentAnswer: { type: DataTypes.STRING(200), allowNull: false },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false },
  attempt: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'lesson_answers', timestamps: true });
