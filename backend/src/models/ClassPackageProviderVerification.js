const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Verificación auditada de la cuenta de Hotmart que cobra los paquetes de clases. La vigente es la última fila del
// proveedor con revokedAt nulo; solo services/classPackageProvider.js la crea o la revoca.
module.exports = sequelize.define('ClassPackageProviderVerification', {
  id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
  provider: { type: D.STRING(32), allowNull: false },
  verifiedById: { type: D.INTEGER, allowNull: false },
  verifiedAt: { type: D.DATE, allowNull: false },
  guaranteeDays: { type: D.SMALLINT.UNSIGNED, allowNull: false },
  checks: { type: D.JSON, allowNull: false },
  reason: { type: D.STRING(500), allowNull: false },
  revokedById: D.INTEGER,
  revokedAt: D.DATE,
  revokeReason: D.STRING(500)
}, { tableName: 'class_package_provider_verifications', timestamps: true });
