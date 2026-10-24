'use strict';

/**
 * W05: verificación auditada de la cuenta de Hotmart que cobra los paquetes de clases (reemplaza el bloqueo fijo de
 * ventas reales). Una fila por verificación; la vigente es la última con revokedAt nulo. Aditiva: no toca tablas
 * existentes. Segura de repetir.
 *
 * activeProvider (generada por MySQL: el proveedor mientras revokedAt es nulo, NULL si no) con índice único: como con
 * pendingOfferId de las órdenes, la base impide dos verificaciones vigentes del mismo proveedor aunque dos
 * solicitudes lleguen a la vez.
 */
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    if (tables.map(t => String(t.tableName || t).toLowerCase()).includes('class_package_provider_verifications')) return;
    const user = allowNull => ({ type: S.INTEGER, allowNull, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
    await q.createTable('class_package_provider_verifications', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      provider: { type: S.STRING(32), allowNull: false },
      verifiedById: user(false),
      verifiedAt: { type: S.DATE, allowNull: false },
      guaranteeDays: { type: S.SMALLINT.UNSIGNED, allowNull: false },
      checks: { type: S.JSON, allowNull: false },
      reason: { type: S.STRING(500), allowNull: false },
      revokedById: user(true),
      revokedAt: { type: S.DATE },
      revokeReason: { type: S.STRING(500) },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false }
    });
    await q.sequelize.query('ALTER TABLE class_package_provider_verifications ADD COLUMN activeProvider VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN `revokedAt` IS NULL THEN `provider` END) STORED');
    await q.addIndex('class_package_provider_verifications', ['activeProvider'], { unique: true, name: 'class_package_provider_verifications_active' });
  },

  async down(q) { await q.dropTable('class_package_provider_verifications'); }
};
