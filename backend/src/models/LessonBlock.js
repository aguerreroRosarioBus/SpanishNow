const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('LessonBlock', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  planId: { type: DataTypes.INTEGER, allowNull: false },
  blockKey: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.ENUM('expression', 'keyframe', 'question', 'full_story', 'flashcards', 'matching', 'listen_repeat'), allowNull: false },
  phase: { type: DataTypes.ENUM('before', 'during', 'after', 'later'), allowNull: false },
  position: { type: DataTypes.INTEGER, allowNull: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  text: { type: DataTypes.TEXT, allowNull: true },
  audioUrl: { type: DataTypes.STRING(500), allowNull: true },
  questionId: { type: DataTypes.INTEGER, allowNull: true },
  contextBlockKey: { type: DataTypes.UUID, allowNull: true },
  vocabularyId: { type: DataTypes.INTEGER, allowNull: true },
  vocabularyRole: { type: DataTypes.ENUM('target', 'support', 'revisit'), allowNull: true },
  revisitStoryId: { type: DataTypes.INTEGER, allowNull: true },
  questionSnapshot: { type: DataTypes.JSON, allowNull: true },
  vocabularySnapshot: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'lesson_blocks', timestamps: true });
