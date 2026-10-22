const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// One checkout attempt of an offer (separate from course orders). Amount and currency come from the offer, never the client.
module.exports = sequelize.define('ClassPackageOrder', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  offerId: { type: D.INTEGER, allowNull: false },
  buyerId: { type: D.INTEGER, allowNull: false },
  amount: { type: D.INTEGER, allowNull: false },
  currency: { type: D.CHAR(3), allowNull: false },
  provider: { type: D.ENUM('hotmart', 'fake'), allowNull: false },
  status: { type: D.ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'paid_needs_review'), allowNull: false, defaultValue: 'pending' },
  // Sent to Hotmart as the tracking parameter; the webhook finds the order with it.
  checkoutRef: { type: D.CHAR(32), allowNull: false, unique: true },
  // = offerId while pending, null otherwise: the unique index allows one pending checkout per offer (PACK-15).
  pendingOfferId: { type: D.INTEGER, unique: true },
  idempotencyKey: D.STRING(64),
  providerTransactionId: { type: D.STRING(64), unique: true },
  providerProductId: D.STRING(40), providerOfferCode: D.STRING(40),
  reportedAmount: D.INTEGER, reportedCurrency: D.CHAR(3), buyerEmailReported: D.STRING(255),
  refundedAmount: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  paidAt: D.DATE, refundedAt: D.DATE, failedAt: D.DATE,
  reviewReason: D.STRING(64), reviewResolvedAt: D.DATE, reviewResolvedById: D.INTEGER
}, { tableName: 'class_package_orders', timestamps: true });
