const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// The Calendar event or Zoom meeting of a session. Only the participant link is stored: Zoom's start_url never is.
module.exports = sequelize.define('ExternalSyncRef', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: { type: D.INTEGER, allowNull: false },
  provider: { type: D.ENUM('google_calendar', 'zoom'), allowNull: false },
  connectionId: D.INTEGER,
  externalId: D.STRING(255), calendarId: D.STRING(255), etag: D.STRING(255),
  syncedVersion: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: D.ENUM('pending', 'ready', 'needs_attention', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  // Sent to the provider so a lost response can be reconciled instead of creating a duplicate.
  correlationKey: { type: D.STRING(64), allowNull: false, unique: true },
  joinUrl: D.STRING(1000), manualJoinUrl: D.STRING(1000), manualJoinUrlById: D.INTEGER,
  lastError: D.STRING(500),
  attempts: { type: D.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'external_sync_refs', timestamps: true });
