const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Every provider event seen, once (unique provider + eventKey). Payload is stored without secrets.
module.exports = sequelize.define('PaymentProviderEvent', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  provider: { type: D.ENUM('hotmart', 'fake'), allowNull: false },
  eventKey: { type: D.STRING(191), allowNull: false },
  eventType: { type: D.STRING(64), allowNull: false },
  providerTransactionId: D.STRING(64),
  occurredAt: D.DATE,
  orderId: D.INTEGER,
  outcome: { type: D.ENUM('received', 'applied', 'ignored', 'needs_review', 'failed'), allowNull: false, defaultValue: 'received' },
  payload: D.JSON, error: D.STRING(500), processedAt: D.DATE
}, { tableName: 'payment_provider_events', timestamps: true, updatedAt: false });
