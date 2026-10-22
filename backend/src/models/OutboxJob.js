const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Durable job written in the same transaction as the state it follows from. Run by services/outbox.js.
module.exports = sequelize.define('OutboxJob', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  topic: { type: D.STRING(64), allowNull: false },
  aggregateType: D.STRING(64), aggregateId: D.INTEGER, aggregateVersion: D.INTEGER,
  dedupeKey: { type: D.STRING(191), allowNull: false, unique: true },
  payload: D.JSON,
  status: { type: D.ENUM('pending', 'running', 'done', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  attempts: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  maxAttempts: { type: D.INTEGER, allowNull: false, defaultValue: 8 },
  runAt: { type: D.DATE(3), allowNull: false },
  lockedBy: D.STRING(64), lockedUntil: D.DATE(3),
  lastError: D.STRING(500), doneAt: D.DATE
}, { tableName: 'outbox_jobs', timestamps: true });
