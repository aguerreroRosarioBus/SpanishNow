const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A teacher's package in the catalog. Its terms live in immutable versions; editing = new version.
module.exports = sequelize.define('ClassPackageTemplate', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: D.INTEGER, allowNull: false },
  templateKey: { type: D.STRING(64), allowNull: false },
  status: { type: D.ENUM('draft', 'active', 'paused', 'archived'), allowNull: false, defaultValue: 'draft' },
  currentVersionId: D.INTEGER
}, { tableName: 'class_package_templates', timestamps: true });
