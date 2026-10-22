const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// One private conversation per teacher-student pair (unique in the database).
module.exports = sequelize.define('Conversation', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: D.INTEGER, allowNull: false },
  studentId: { type: D.INTEGER, allowNull: false },
  createdById: D.INTEGER,
  // Last server sequence handed out; messages.seq is unique per conversation.
  lastMessageSeq: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  lastMessageAt: D.DATE,
  teacherFirstReplyAt: D.DATE
}, { tableName: 'conversations', timestamps: true });
