const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Discount coupon of a teacher: percentOff (1-100) or amountOff (cents, in `currency`), never both.
const Coupon = sequelize.define('Coupon', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  // Uppercase A-Z, 0-9 and hyphens; unique across the platform.
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  percentOff: { type: DataTypes.INTEGER, allowNull: true },
  // In cents.
  amountOff: { type: DataTypes.INTEGER, allowNull: true },
  currency: { type: DataTypes.STRING(3), allowNull: true },
  // Null = every course of the teacher.
  courseId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'courses', key: 'id' } },
  maxRedemptions: { type: DataTypes.INTEGER, allowNull: true },
  // Counts paid orders (incremented by fulfillOrder), not checkouts started.
  redemptions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  timestamps: true,
  tableName: 'coupons'
});

module.exports = Coupon;
