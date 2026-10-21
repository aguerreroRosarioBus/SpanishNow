const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Multiple-choice quiz at the end of a unit. One per unit.
const UnitQuiz = sequelize.define('UnitQuiz', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  unitId: { type: DataTypes.INTEGER, allowNull: false, unique: true, references: { model: 'units', key: 'id' } },
  title: { type: DataTypes.STRING(200), allowNull: false },
  passingScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 70 },
  isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { timestamps: true, tableName: 'unit_quizzes' });

module.exports = UnitQuiz;
