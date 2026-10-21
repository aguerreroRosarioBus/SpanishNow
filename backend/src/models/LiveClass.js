const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('LiveClass', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: D.INTEGER, allowNull: false },
  courseId: { type: D.INTEGER, allowNull: true },
  title: { type: D.STRING(200), allowNull: false },
  status: { type: D.ENUM('draft', 'live', 'ended'), allowNull: false, defaultValue: 'draft' },
  joinCode: { type: D.STRING(32), allowNull: false, unique: true },
  allowStudentEdit: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
  board: { type: D.JSON, allowNull: false },
  revision: { type: D.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  recentOperations: { type: D.JSON, allowNull: false, defaultValue: [] },
  classroomCourseId: D.STRING(128), classroomCourseName: D.STRING(200),
  classroomAnnouncementId: D.STRING(128), classroomAnnouncementUrl: D.STRING(500),
  driveFileId: D.STRING(128), driveFileUrl: D.STRING(500)
}, { tableName: 'live_classes', timestamps: true });
