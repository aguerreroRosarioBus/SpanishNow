// Cerrojo por producto compartido por cursos y paquetes; no contiene condiciones ni datos de compradores.
module.exports = {
  async up(q, S) {
    const tables = (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
    if (!tables.includes('hotmart_product_locks')) await q.createTable('hotmart_product_locks', {
      productId: { type: S.STRING(40), allowNull: false, primaryKey: true }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
  },
  async down(q) { await q.dropTable('hotmart_product_locks'); }
};
