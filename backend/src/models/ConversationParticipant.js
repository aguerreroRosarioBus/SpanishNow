const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('ConversationParticipant', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  conversationId: { type: D.INTEGER, allowNull: false },
  userId: { type: D.INTEGER, allowNull: false },
  role: { type: D.ENUM('teacher', 'student'), allowNull: false },
  // Monotonic: only ever moves forward.
  lastReadSeq: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  emailNotifiedSeq: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  blockedAt: D.DATE, reportedAt: D.DATE, reportReason: D.STRING(500)
}, { tableName: 'conversation_participants', timestamps: true });
