// Independiente de external_connections: su migración histórica tiene fecha posterior (20261108).
// Solo hashes y fecha de recepción, sin payload, tokens ni identificadores de cuenta en claro.
const TABLE = 'zoom_webhook_receipts';
const INDEX = 'zoom_webhook_receipts_received_at';
const tables = async q => (await q.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
module.exports = {
  async up(q, S) {
    if (!(await tables(q)).includes(TABLE)) await q.createTable(TABLE, {
      eventKey: { type: S.STRING(64), allowNull: false, primaryKey: true },
      receivedAt: { type: S.DATE, allowNull: false }
    }, { engine: 'InnoDB', charset: 'utf8mb4', collate: 'utf8mb4_bin' });
    if (!(await q.showIndex(TABLE)).some(index => index.name === INDEX)) await q.addIndex(TABLE, ['receivedAt'], { name: INDEX });
  },
  async down(q) {
    if (!(await tables(q)).includes(TABLE)) return;
    const [rows] = await q.sequelize.query('SELECT 1 FROM zoom_webhook_receipts LIMIT 1');
    if (rows.length && process.env.CONFIRM_ZOOM_WEBHOOK_RECEIPTS_DATA_LOSS !== 'yes') {
      throw new Error('Revertir recibos de Zoom requiere CONFIRM_ZOOM_WEBHOOK_RECEIPTS_DATA_LOSS=yes');
    }
    await q.dropTable(TABLE);
  }
};
