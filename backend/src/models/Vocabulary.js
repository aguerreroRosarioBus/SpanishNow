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
  },
  example: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Example sentence using the word'
  },
  partOfSpeech: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'noun, verb, adjective, adverb, etc.'
  },
  audioUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL to pronunciation audio file'
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL to visual representation image'
  }
}, {
  timestamps: true,
  tableName: 'vocabulary'
});

module.exports = Vocabulary;
