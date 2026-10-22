const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A proposed time (initial or reschedule). A pending, unexpired proposal holds the slot provisionally (AGENDA-02).
module.exports = sequelize.define('ClassSessionProposal', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: { type: D.INTEGER, allowNull: false },
  version: { type: D.INTEGER, allowNull: false },
  kind: { type: D.ENUM('initial', 'reschedule'), allowNull: false },
  status: { type: D.ENUM('pending', 'accepted', 'declined', 'expired', 'superseded', 'withdrawn'), allowNull: false, defaultValue: 'pending' },
  startsAt: { type: D.DATE, allowNull: false },
  endsAt: { type: D.DATE, allowNull: false },
  timeZone: { type: D.STRING(64), allowNull: false },
  localStart: { type: D.CHAR(16), allowNull: false },
  utcOffset: { type: D.CHAR(6), allowNull: false },
  disambiguation: { type: D.ENUM('none', 'earlier', 'later'), allowNull: false, defaultValue: 'none' },
  minutes: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  proposedById: { type: D.INTEGER, allowNull: false },
  expiresAt: { type: D.DATE, allowNull: false },
  leadTimeException: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  resolvedAt: D.DATE
}, { tableName: 'class_session_proposals', timestamps: true });
