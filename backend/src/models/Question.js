const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Question = sequelize.define('Question', {
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
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  answerType: {
    type: DataTypes.ENUM('yes_no', 'choice', 'open_ended'),
    allowNull: false,
    defaultValue: 'yes_no'
  },
  options: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of options for choice questions'
  },
  correctAnswer: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Correct answer for yes_no and choice questions. Optional for open_ended questions.'
  },
  audioUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL for question audio file'
  }
}, {
  timestamps: true,
  tableName: 'questions'
});

module.exports = Question;
