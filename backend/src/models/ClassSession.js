const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A scheduled class (not a whiteboard: liveClassId links one optionally). Instants in UTC, [startsAt, endsAt).
// localStart/timeZone/utcOffset/disambiguation keep the scheduling intention (TZ-05).
module.exports = sequelize.define('ClassSession', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: D.INTEGER, allowNull: false },
  kind: { type: D.ENUM('individual', 'group'), allowNull: false },
  cohortId: D.INTEGER,
  status: {
    type: D.ENUM('draft', 'forming', 'proposed', 'confirmed', 'completed', 'declined', 'expired', 'cancelled', 'student_no_show', 'teacher_no_show'),
    allowNull: false, defaultValue: 'draft'
  },
  version: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
  startsAt: { type: D.DATE, allowNull: false },
  endsAt: { type: D.DATE, allowNull: false },
  timeZone: { type: D.STRING(64), allowNull: false },
  localStart: { type: D.CHAR(16), allowNull: false },
  utcOffset: { type: D.CHAR(6), allowNull: false },
  disambiguation: { type: D.ENUM('none', 'earlier', 'later'), allowNull: false, defaultValue: 'none' },
  minutes: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  liveClassId: D.INTEGER,
  idempotencyKey: D.STRING(64),
  confirmedAt: D.DATE, cancelledAt: D.DATE, cancelledById: D.INTEGER, cancelReason: D.STRING(500), chargeWaivedReason: D.STRING(500)
}, { tableName: 'class_sessions', timestamps: true });
