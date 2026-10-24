'use strict';

/**
 * W05 (#45): estado de la compra antes de congelarla por un reembolso que no cuadra. Permite descongelar una falsa
 * alarma devolviendo la compra a donde estaba. Las compras congeladas antes de esta migración quedan en NULL y no se
 * pueden descongelar automáticamente. Aditiva y segura de repetir.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('class_package_purchases');
    if (!columns.frozenFromStatus) await q.addColumn('class_package_purchases', 'frozenFromStatus', { type: S.ENUM('active', 'paused', 'exhausted', 'expired'), allowNull: true });
  },

  async down(q) {
    const columns = await q.describeTable('class_package_purchases');
    if (columns.frozenFromStatus) await q.removeColumn('class_package_purchases', 'frozenFromStatus');
  }
};
