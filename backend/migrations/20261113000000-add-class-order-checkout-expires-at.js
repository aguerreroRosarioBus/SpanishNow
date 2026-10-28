'use strict';

/**
 * #56 (AC13): cada intento de pago (link de checkout) tiene su propia fecha de caducidad. Pasada esa fecha no se
 * reutiliza el link y un pago aprobado después queda en revisión manual. Las órdenes anteriores quedan en NULL y solo
 * dependen de la caducidad de la oferta. Aditiva y segura de repetir.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('class_package_orders');
    if (!columns.checkoutExpiresAt) await q.addColumn('class_package_orders', 'checkoutExpiresAt', { type: S.DATE, allowNull: true });
  },

  async down(q) {
    const columns = await q.describeTable('class_package_orders');
    if (columns.checkoutExpiresAt) await q.removeColumn('class_package_orders', 'checkoutExpiresAt');
  }
};
