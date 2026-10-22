const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Per-teacher class settings. The row is also the teacher's schedule lock (CONTRATO.md §6.4).
module.exports = sequelize.define('TeacherClassSettings', {
  userId: { type: D.INTEGER, primaryKey: true },
  // Set by an admin with class_teachers.manage; null = the teacher neither takes inquiries nor sells classes.
  classesEnabledAt: D.DATE,
  acceptsInquiries: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  salesPausedAt: D.DATE,
  sessionBufferMinutes: { type: D.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 10 },
  minLeadTimeHours: { type: D.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 24 }
}, { tableName: 'teacher_class_settings', timestamps: true });
