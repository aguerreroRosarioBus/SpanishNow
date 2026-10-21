const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Certificate of completion. Names are copies taken when it is issued; `code` is public (verification page).
const Certificate = sequelize.define('Certificate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  enrollmentId: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'enrollments', key: 'id' } },
  code: { type: DataTypes.STRING(16), allowNull: false, unique: true },
  studentName: { type: DataTypes.STRING(200), allowNull: false },
  courseTitle: { type: DataTypes.STRING(200), allowNull: false },
  teacherName: { type: DataTypes.STRING(200), allowNull: false },
  issuedAt: { type: DataTypes.DATE, allowNull: false }
}, { timestamps: true, tableName: 'certificates' });

module.exports = Certificate;
