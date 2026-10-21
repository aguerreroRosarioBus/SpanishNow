const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// correctIndex and explanation never reach a student before they submit an attempt (see services/quizService.js).
const UnitQuizQuestion = sequelize.define('UnitQuizQuestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'unit_quizzes', key: 'id' } },
  order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  prompt: { type: DataTypes.TEXT, allowNull: false },
  options: { type: DataTypes.JSON, allowNull: false },
  correctIndex: { type: DataTypes.INTEGER, allowNull: false },
  explanation: { type: DataTypes.TEXT, allowNull: true }
}, { timestamps: true, tableName: 'unit_quiz_questions' });

module.exports = UnitQuizQuestion;
