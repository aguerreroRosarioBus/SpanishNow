const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('LegalDocumentHead', {
  documentKey: { type: D.STRING(32), primaryKey: true }, lastVersion: { type: D.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'legal_document_heads', timestamps: false });
