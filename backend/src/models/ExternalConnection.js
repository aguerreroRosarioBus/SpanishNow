const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A teacher's Google Calendar or Zoom account. Separate from google_connections (Drive/Classroom). Credentials encrypted.
module.exports = sequelize.define('ExternalConnection', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: D.INTEGER, allowNull: false },
  provider: { type: D.ENUM('google_calendar', 'zoom'), allowNull: false },
  status: { type: D.ENUM('pending', 'connected', 'needs_attention', 'revoked', 'disconnected'), allowNull: false, defaultValue: 'pending' },
  accountEmail: D.STRING(254), credentials: D.TEXT, scopes: D.TEXT, capabilities: D.JSON,
  targetCalendarId: D.STRING(255), busyCalendarIds: D.JSON,
  tokenExpiresAt: D.DATE, refreshLockedUntil: D.DATE,
  oauthStateHash: { type: D.STRING(64), unique: true }, oauthVerifier: D.TEXT, oauthExpiresAt: D.DATE,
  lastError: D.STRING(500),
  version: { type: D.INTEGER, allowNull: false, defaultValue: 1 }
}, { tableName: 'external_connections', timestamps: true });
