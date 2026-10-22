const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('CourseCheckoutSnapshot', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true }, courseId: { type: D.INTEGER, allowNull: false },
  userId: D.INTEGER, orderId: { type: D.INTEGER, unique: true }, snapshot: { type: D.JSON, allowNull: false },
  locale: { type: D.ENUM('en', 'es'), allowNull: false }, acceptedAt: D.DATE(3)
}, { tableName: 'course_checkout_snapshots', timestamps: true, updatedAt: false });
