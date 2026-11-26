const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('TeacherHotmartConnection', {
  teacherId: { type: D.INTEGER, primaryKey: true, references: { model: 'users', key: 'id' } },
  publicId: { type: D.UUID, allowNull: false, unique: true },
  activeDigest: D.STRING(64),
  pendingDigest: D.STRING(64),
  verifiedAt: D.DATE,
  classActiveDigest: D.STRING(64),
  classPendingDigest: D.STRING(64),
  classVerifiedAt: D.DATE
}, { tableName: 'teacher_hotmart_connections', timestamps: true });
