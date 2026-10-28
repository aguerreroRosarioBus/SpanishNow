const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('ZoomWebhookReceipt', {
  eventKey: { type: D.STRING(64), allowNull: false, primaryKey: true },
  receivedAt: { type: D.DATE, allowNull: false }
}, { tableName: 'zoom_webhook_receipts', timestamps: false,
  indexes: [{ name: 'zoom_webhook_receipts_received_at', fields: ['receivedAt'] }] });
