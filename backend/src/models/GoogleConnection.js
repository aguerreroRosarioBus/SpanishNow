const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('GoogleConnection', {
  userId: { type: D.INTEGER, primaryKey: true },
  credentials: D.TEXT, email: D.STRING(254), scopes: D.TEXT,
  oauthStateHash: { type: D.STRING(64), unique: true },
  oauthVerifier: D.TEXT, oauthExpiresAt: D.DATE
}, { tableName: 'google_connections', timestamps: true });
