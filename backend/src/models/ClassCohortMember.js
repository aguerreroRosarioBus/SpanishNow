const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('ClassCohortMember', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  cohortId: { type: D.INTEGER, allowNull: false },
  userId: { type: D.INTEGER, allowNull: false },
  invitedById: D.INTEGER,
  status: { type: D.ENUM('invited', 'accepted', 'declined', 'removed'), allowNull: false, defaultValue: 'invited' },
  respondedAt: D.DATE
}, { tableName: 'class_cohort_members', timestamps: true });
