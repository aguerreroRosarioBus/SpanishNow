const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A paid package. Balances are materialized here and only change through services/classCredits.js:
// unitsGranted = unitsAvailable + unitsReserved + unitsConsumed + unitsExpired + unitsRefunded (CHECK in the database).
// A fresh definition per column: Sequelize mutates attribute definitions, so they cannot be shared.
const units = () => ({ type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
module.exports = sequelize.define('ClassPackagePurchase', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: D.INTEGER, allowNull: false, unique: true },
  offerId: { type: D.INTEGER, allowNull: false, unique: true },
  teacherId: { type: D.INTEGER, allowNull: false },
  buyerId: { type: D.INTEGER, allowNull: false },
  cohortId: D.INTEGER,
  templateVersionId: { type: D.INTEGER, allowNull: false },
  policyVersionId: { type: D.INTEGER, allowNull: false },
  snapshot: { type: D.JSON, allowNull: false },
  minutesPerSession: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  seatsCovered: { type: D.TINYINT.UNSIGNED, allowNull: false },
  status: { type: D.ENUM('active', 'paused', 'exhausted', 'expired', 'cancelled'), allowNull: false, defaultValue: 'active' },
  paidAt: { type: D.DATE, allowNull: false },
  expiresAt: { type: D.DATE, allowNull: false },
  pausedAt: D.DATE,
  pausedHoursUsed: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  pauseCount: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  cancelledAt: D.DATE,
  version: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
  unitsGranted: units(), unitsAvailable: units(), unitsReserved: units(), unitsConsumed: units(), unitsExpired: units(), unitsRefunded: units()
}, { tableName: 'class_package_purchases', timestamps: true });
