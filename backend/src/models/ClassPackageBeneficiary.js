const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('ClassPackageBeneficiary', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  purchaseId: { type: D.INTEGER, allowNull: false },
  userId: { type: D.INTEGER, allowNull: false }
}, { tableName: 'class_package_beneficiaries', timestamps: true, updatedAt: false });
