const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Unit = sequelize.define('Unit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Drip content (see services/unitAvailability.js): days after the student's enrolment and/or a fixed date (UTC).
  // Both set: the unit opens when both are met. Null: no restriction.
  releaseAfterDays: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  releaseAt: {
    // 'YYYY-MM-DD'; the unit opens at 00:00 UTC of that day.
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'units'
});

module.exports = Unit;
