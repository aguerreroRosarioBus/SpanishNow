const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('CourseExpectations', {
  courseId: { type: D.INTEGER, primaryKey: true }, version: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  expectations: { type: D.JSON, allowNull: false }, updatedById: D.INTEGER
}, { tableName: 'course_expectations', timestamps: true });
