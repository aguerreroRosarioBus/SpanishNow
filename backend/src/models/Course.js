const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  level: {
    type: DataTypes.ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
    allowNull: false
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'courses'
});

module.exports = Course;
