const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A payment the teacher made to an affiliate outside the platform (PayPal, bank transfer...), registered by hand.
const AffiliatePayout = sequelize.define('AffiliatePayout', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  affiliateId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'affiliates', key: 'id' } },
  // In cents.
  amount: { type: DataTypes.INTEGER, allowNull: false },
  // Lowercase 3-letter code, like orders.currency.
  currency: { type: DataTypes.STRING(3), allowNull: false },
  paidAt: { type: DataTypes.DATE, allowNull: false },
  note: { type: DataTypes.STRING(300), allowNull: true }
}, {
  timestamps: true,
  tableName: 'affiliate_payouts'
});

module.exports = AffiliatePayout;
