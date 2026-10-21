const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Question or answer under a lesson (story). parentId null = first level; a reply points to a first-level comment (one level only).
const LessonComment = sequelize.define('LessonComment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  storyId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'stories', key: 'id' } },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  parentId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'lesson_comments', key: 'id' } },
  // Plain text, 1-2000 characters (see services/commentService.js). Clients must render it as text, never as HTML.
  body: { type: DataTypes.TEXT, allowNull: false },
  // Teacher moderation: hidden comments are visible to the teacher and to their author only.
  hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  editedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  tableName: 'lesson_comments'
});

module.exports = LessonComment;
