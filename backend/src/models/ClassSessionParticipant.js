const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A seat in a session: who attends, which purchase pays, their acceptance and attendance (per seat, AGENDA-01).
module.exports = sequelize.define('ClassSessionParticipant', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  sessionId: { type: D.INTEGER, allowNull: false },
  userId: { type: D.INTEGER, allowNull: false },
  purchaseId: D.INTEGER,
  status: { type: D.ENUM('invited', 'accepted', 'declined', 'confirmed', 'cancelled'), allowNull: false, defaultValue: 'invited' },
  acceptedVersion: D.INTEGER,
  acceptedAt: D.DATE,
  attendance: { type: D.ENUM('pending', 'attended', 'student_no_show', 'teacher_no_show', 'excused'), allowNull: false, defaultValue: 'pending' },
  attendanceMarkedById: D.INTEGER,
  attendanceMarkedAt: D.DATE
}, { tableName: 'class_session_participants', timestamps: true });
