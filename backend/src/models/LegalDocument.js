const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('LegalDocument', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  documentKey: { type: D.STRING(32), allowNull: false }, version: { type: D.INTEGER, allowNull: false },
  content: { type: D.JSON, allowNull: false }, business: { type: D.JSON, allowNull: false },
  effectiveAt: { type: D.DATE(3), allowNull: false }, publishedAt: D.DATE(3), createdById: D.INTEGER, publishedById: D.INTEGER
}, { tableName: 'legal_documents', timestamps: true, updatedAt: false });
