const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Enrollment = sequelize.define('Enrollment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  // How the student got access.
  source: {
    type: DataTypes.ENUM('free', 'purchase', 'manual', 'hotmart_import'),
    allowNull: false,
    defaultValue: 'free'
  },
  // The order that paid for this enrollment (source = 'purchase').
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  tableName: 'enrollments'
});

module.exports = Enrollment;
