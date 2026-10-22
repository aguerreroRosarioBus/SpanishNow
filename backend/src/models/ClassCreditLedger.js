const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Append-only credit movements. Written only by services/classCredits.js; operationKey makes each one happen once.
module.exports = sequelize.define('ClassCreditLedger', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  purchaseId: { type: D.INTEGER, allowNull: false },
  operation: { type: D.ENUM('grant', 'reserve', 'release', 'consume', 'expire', 'refund', 'adjust'), allowNull: false },
  units: { type: D.INTEGER.UNSIGNED, allowNull: false },
  fromBucket: { type: D.ENUM('none', 'available', 'reserved', 'consumed'), allowNull: false },
  toBucket: { type: D.ENUM('none', 'available', 'reserved', 'consumed', 'expired', 'refunded'), allowNull: false },
  operationKey: { type: D.STRING(191), allowNull: false, unique: true },
  classSessionId: D.INTEGER,
  actorId: D.INTEGER,
  reason: D.STRING(255)
}, { tableName: 'class_credit_ledger', timestamps: true, updatedAt: false });
