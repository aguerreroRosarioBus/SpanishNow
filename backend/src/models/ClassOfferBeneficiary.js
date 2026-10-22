const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('ClassOfferBeneficiary', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  offerId: { type: D.INTEGER, allowNull: false },
  userId: { type: D.INTEGER, allowNull: false }
}, { tableName: 'class_offer_beneficiaries', timestamps: true, updatedAt: false });
