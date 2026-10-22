const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Immutable terms of a package. Money in minor units with an ISO currency (USD 15 = 1500, 'USD').
module.exports = sequelize.define('ClassPackageTemplateVersion', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  templateId: { type: D.INTEGER, allowNull: false },
  version: { type: D.INTEGER, allowNull: false },
  nameEn: { type: D.STRING(150), allowNull: false }, nameEs: { type: D.STRING(150), allowNull: false },
  descriptionEn: D.TEXT, descriptionEs: D.TEXT,
  modality: { type: D.ENUM('individual', 'group'), allowNull: false },
  groupSize: { type: D.TINYINT.UNSIGNED, allowNull: false, defaultValue: 1 },
  // per_buyer: individual; per_group: one buyer pays for every seat (group of 2); per_seat: each participant buys one (group of 3).
  billing: { type: D.ENUM('per_buyer', 'per_group', 'per_seat'), allowNull: false },
  sessionsCount: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  minutesPerSession: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  seatsCovered: { type: D.TINYINT.UNSIGNED, allowNull: false, defaultValue: 1 },
  priceAmount: { type: D.INTEGER, allowNull: false },
  currency: { type: D.CHAR(3), allowNull: false },
  validityHours: { type: D.INTEGER, allowNull: false },
  policyVersionId: { type: D.INTEGER, allowNull: false },
  // Hotmart product and offer (the off= code) whose price equals priceAmount/currency (D10).
  hotmartProductId: D.STRING(40), hotmartOfferCode: D.STRING(40), hotmartCheckoutUrl: D.STRING(500),
  expectations: D.JSON,
  createdById: D.INTEGER
}, { tableName: 'class_package_template_versions', timestamps: true, updatedAt: false });
