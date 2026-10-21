const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A purchase of a course. One row per checkout session.
const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  courseId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'courses', key: 'id' } },
  // Known only once the payment is confirmed (anonymous buyers).
  userId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
  // Null until the payment provider reports the buyer's email (anonymous buyers).
  email: { type: DataTypes.STRING(255), allowNull: true },
  // In cents.
  amount: { type: DataTypes.INTEGER, allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid', 'refunded', 'failed'), allowNull: false, defaultValue: 'pending' },
  // 'coupon': a 100 % discount, fulfilled without a payment provider.
  provider: { type: DataTypes.ENUM('stripe', 'fake', 'coupon'), allowNull: false },
  providerSessionId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  providerPaymentId: { type: DataTypes.STRING(255), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true },
  couponId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'coupons', key: 'id' } },
  // Price of the course before the coupon, in cents (null in orders that predate coupons). amount = originalAmount - discountAmount.
  originalAmount: { type: DataTypes.INTEGER, allowNull: true },
  discountAmount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Cumulative money returned, in cents (<= amount). The status becomes 'refunded' when all of it was returned.
  refundedAmount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  refundedAt: { type: DataTypes.DATE, allowNull: true },
  // Stripe's charge.receipt_url, when the provider gives one.
  receiptUrl: { type: DataTypes.STRING(500), allowNull: true }
}, {
  timestamps: true,
  tableName: 'orders'
});

module.exports = Order;
