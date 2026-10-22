const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Messages are never edited or deleted; moderation hides them (hiddenAt) and keeps the commercial references.
module.exports = sequelize.define('Message', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  conversationId: { type: D.INTEGER, allowNull: false },
  seq: { type: D.INTEGER, allowNull: false },
  // null = system message (only the backend creates offer, session_proposal and system_event messages).
  senderId: D.INTEGER,
  type: { type: D.ENUM('text', 'offer', 'session_proposal', 'system_event'), allowNull: false },
  body: D.TEXT,
  clientMessageId: D.STRING(64),
  offerId: D.INTEGER, classSessionId: D.INTEGER, proposalVersion: D.INTEGER,
  eventCode: D.STRING(64), eventParams: D.JSON,
  contextType: D.ENUM('course', 'package', 'session'), contextId: D.INTEGER,
  hiddenAt: D.DATE, hiddenById: D.INTEGER, hiddenReason: D.STRING(500)
}, { tableName: 'messages', timestamps: true, updatedAt: false });
