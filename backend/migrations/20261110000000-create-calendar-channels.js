'use strict';

/**
 * W07 (CAL-07): estado de sincronización de Google Calendar por (conexión, calendario): token de sync incremental y,
 * si hay GOOGLE_CALENDAR_NOTIFICATIONS_URL, el canal push (id, recurso, URL registrada, hash del token y vencimiento). Sin canal se
 * sincroniza por sondeo. Aditiva: no toca tablas existentes. Segura de repetir.
 */
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    if (tables.map(t => String(t.tableName || t).toLowerCase()).includes('external_calendar_channels')) return;
    await q.createTable('external_calendar_channels', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      connectionId: { type: S.INTEGER, allowNull: false, references: { model: 'external_connections', key: 'id' }, onDelete: 'CASCADE' },
      calendarId: { type: S.STRING(255), allowNull: false },
      channelId: { type: S.STRING(64) },
      address: { type: S.STRING(1000) },
      resourceId: { type: S.STRING(255) },
      tokenHash: { type: S.STRING(64) },
      expiresAt: { type: S.DATE },
      lastMessageNumber: { type: S.BIGINT, allowNull: false, defaultValue: 0 },
      syncToken: { type: S.TEXT },
      lastSyncedAt: { type: S.DATE },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false }
    });
    await q.addIndex('external_calendar_channels', ['connectionId', 'calendarId'], { unique: true, name: 'external_calendar_channels_connection_calendar' });
    await q.addIndex('external_calendar_channels', ['channelId'], { unique: true, name: 'external_calendar_channels_channel' });
    await q.addIndex('external_calendar_channels', ['expiresAt'], { name: 'external_calendar_channels_expires' });
  },

  async down(q) { await q.dropTable('external_calendar_channels'); }
};
