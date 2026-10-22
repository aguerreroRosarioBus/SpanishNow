const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Append-only: which version of which document a user accepted, when (UTC) and in what context (LEGAL-02).
module.exports = sequelize.define('LegalAcceptance', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: D.INTEGER, allowNull: false },
  documentKey: { type: D.STRING(32), allowNull: false },
  documentVersion: { type: D.STRING(32), allowNull: false },
  locale: D.ENUM('en', 'es'),
  context: { type: D.ENUM('signup', 'checkout', 'update'), allowNull: false },
  contextType: D.STRING(32), contextId: D.INTEGER,
  acceptedAt: { type: D.DATE, allowNull: false }
}, { tableName: 'legal_acceptances', timestamps: true, updatedAt: false });
