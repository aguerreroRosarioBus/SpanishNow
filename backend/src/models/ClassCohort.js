const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// A group the teacher forms before sending group offers (GROUP-03/04).
module.exports = sequelize.define('ClassCohort', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: { type: D.INTEGER, allowNull: false },
  templateVersionId: { type: D.INTEGER, allowNull: false },
  groupSize: { type: D.TINYINT.UNSIGNED, allowNull: false },
  formingDeadlineAt: { type: D.DATE, allowNull: false },
  tentativeStartsAt: D.DATE,
  status: { type: D.ENUM('forming', 'ready', 'cancelled', 'completed'), allowNull: false, defaultValue: 'forming' }
}, { tableName: 'class_cohorts', timestamps: true });
