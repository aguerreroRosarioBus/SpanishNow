const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Immutable commercial rules (validated by domain/classPolicy.js). Changing them = a new version.
module.exports = sequelize.define('ClassPolicyVersion', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  version: { type: D.INTEGER, allowNull: false, unique: true },
  rules: { type: D.JSON, allowNull: false },
  createdById: D.INTEGER
}, { tableName: 'class_policy_versions', timestamps: true, updatedAt: false });
