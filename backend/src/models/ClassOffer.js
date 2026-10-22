const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// An offer sent in the chat. Immutable once sent: fixing it means cancel/replace (PACK-11). An offer is not a payment.
module.exports = sequelize.define('ClassOffer', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  conversationId: { type: D.INTEGER, allowNull: false },
  teacherId: { type: D.INTEGER, allowNull: false },
  buyerId: { type: D.INTEGER, allowNull: false },
  cohortId: D.INTEGER,
  templateVersionId: { type: D.INTEGER, allowNull: false },
  policyVersionId: { type: D.INTEGER, allowNull: false },
  replacesOfferId: D.INTEGER,
  status: { type: D.ENUM('draft', 'sent', 'checkout_pending', 'paid', 'expired', 'cancelled', 'replaced'), allowNull: false, defaultValue: 'draft' },
  snapshot: { type: D.JSON, allowNull: false },
  amount: { type: D.INTEGER, allowNull: false },
  currency: { type: D.CHAR(3), allowNull: false },
  sessionsCount: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  minutesPerSession: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  seatsCovered: { type: D.TINYINT.UNSIGNED, allowNull: false },
  validityHours: { type: D.INTEGER, allowNull: false },
  hotmartProductId: D.STRING(40), hotmartOfferCode: D.STRING(40),
  idempotencyKey: D.STRING(64),
  sentAt: D.DATE, expiresAt: D.DATE, cancelledAt: D.DATE, cancelReason: D.STRING(500)
}, { tableName: 'class_offers', timestamps: true });
