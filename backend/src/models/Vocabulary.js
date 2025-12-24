const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Vocabulary = sequelize.define('Vocabulary', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  unitId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'units',
      key: 'id'
    }
  },
  word: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  translation: {
    type: DataTypes.STRING(100),
    allowNull: false
  }
}, {
  timestamps: true,
  tableName: 'vocabulary'
});

module.exports = Vocabulary;
