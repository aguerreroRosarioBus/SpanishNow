const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// One submission of a quiz by an enrolment. Unlimited attempts; the best score counts.
const UnitQuizAttempt = sequelize.define('UnitQuizAttempt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'unit_quizzes', key: 'id' } },
  enrollmentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'enrollments', key: 'id' } },
  // One option index per question, in question order (null = left blank).
  answers: { type: DataTypes.JSON, allowNull: false },
  score: { type: DataTypes.INTEGER, allowNull: false },
  passed: { type: DataTypes.BOOLEAN, allowNull: false }
}, { timestamps: true, tableName: 'unit_quiz_attempts' });

module.exports = UnitQuizAttempt;
