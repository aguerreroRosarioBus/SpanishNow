const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('LiveClassMember', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  liveClassId: { type: D.INTEGER, allowNull: false },
  userId: { type: D.INTEGER, allowNull: false },
  lastSeenAt: { type: D.DATE, allowNull: false }
}, { tableName: 'live_class_members', timestamps: true, indexes: [{ unique: true, fields: ['liveClassId', 'userId'] }] });
