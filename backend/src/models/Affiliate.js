const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Affiliate of a teacher: sells through a link (?ref=code) and watches a private dashboard (dashboardToken). No account.
const Affiliate = sequelize.define('Affiliate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false },
  // Uppercase A-Z, 0-9 and hyphens; unique across the platform.
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  // 1-90. Only affects sales made after the change (each order keeps the percentage it was fulfilled with).
  commissionPercent: { type: DataTypes.INTEGER, allowNull: false },
  // Secret of the private dashboard link: 32 random bytes, base64url. Regenerating it invalidates the old link.
  dashboardToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, {
  timestamps: true,
  tableName: 'affiliates'
});

module.exports = Affiliate;
