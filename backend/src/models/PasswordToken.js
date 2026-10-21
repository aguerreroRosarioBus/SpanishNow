const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// One-time token to reset a password ('reset') or to choose the first one ('invite').
// Only the sha256 of the token is stored (see services/passwordTokens.js).
const PasswordToken = sequelize.define('PasswordToken', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  purpose: { type: DataTypes.ENUM('reset', 'invite'), allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  tableName: 'password_tokens'
});

module.exports = PasswordToken;
