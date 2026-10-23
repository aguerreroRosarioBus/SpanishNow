const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// W07 (CAL-07): sync incremental y canal push de un calendario de una conexión. El token del canal solo se guarda como hash.
module.exports = sequelize.define('ExternalCalendarChannel', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  connectionId: { type: D.INTEGER, allowNull: false },
  calendarId: { type: D.STRING(255), allowNull: false },
  channelId: { type: D.STRING(64), unique: true },
  address: D.STRING(1000), resourceId: D.STRING(255), tokenHash: D.STRING(64), expiresAt: D.DATE,
  lastMessageNumber: { type: D.BIGINT, allowNull: false, defaultValue: 0 },
  syncToken: D.TEXT, lastSyncedAt: D.DATE
}, { tableName: 'external_calendar_channels', timestamps: true });
