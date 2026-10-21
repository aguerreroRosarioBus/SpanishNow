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
  provider: { type: DataTypes.ENUM('stripe', 'fake'), allowNull: false },
  providerSessionId: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  providerPaymentId: { type: DataTypes.STRING(255), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  tableName: 'orders'
});

module.exports = Order;
