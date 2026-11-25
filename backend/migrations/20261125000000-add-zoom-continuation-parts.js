'use strict';

/**
 * #98: una cuenta Zoom Basic corta cada reunión a los 40 minutos. Una clase más larga se parte en tramos consecutivos y
 * cada tramo es su propia reunión. El primero sigue en external_id/join_url; los siguientes (índice 2, 3…) viven en esta
 * columna JSON: [{ index, correlationKey, externalId, joinUrl, startsAt, minutes }]. Solo guarda enlaces de participante.
 * Aditiva y segura de repetir; las clases de un solo tramo la dejan en NULL.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('external_sync_refs');
    if (!columns.parts) await q.addColumn('external_sync_refs', 'parts', { type: S.JSON, allowNull: true });
  },

  async down(q) {
    const columns = await q.describeTable('external_sync_refs');
    if (columns.parts) await q.removeColumn('external_sync_refs', 'parts');
  }
};
