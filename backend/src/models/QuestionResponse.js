const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuestionResponse = sequelize.define('QuestionResponse', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  progressId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'progress',
      key: 'id'
    }
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'questions',
      key: 'id'
    }
  },
  studentAnswer: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  }
}, {
  timestamps: true,
  tableName: 'question_responses',
  indexes: [
    {
      unique: true,
      fields: ['progressId', 'questionId'],
      name: 'unique_progress_question'
    }
  ]
});

module.exports = QuestionResponse;
