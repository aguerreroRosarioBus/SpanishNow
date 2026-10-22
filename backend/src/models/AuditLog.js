const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Append-only record of exceptional changes (credit adjustments, hidden messages, attendance fixes, payment reviews).
// Never stores tokens, host links or private message text.
module.exports = sequelize.define('AuditLog', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  actorId: D.INTEGER, impersonatedById: D.INTEGER,
  action: { type: D.STRING(64), allowNull: false },
  entityType: { type: D.STRING(64), allowNull: false },
  entityId: D.INTEGER,
  reason: D.STRING(500),
  data: D.JSON
}, { tableName: 'audit_logs', timestamps: true, updatedAt: false });
