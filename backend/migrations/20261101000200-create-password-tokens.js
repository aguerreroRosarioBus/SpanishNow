'use strict';

const TABLE = 'password_tokens';
const HASH_INDEX = 'password_tokens_hash_unique';

/**
 * One-time tokens to reset a password ("forgot password") or to choose one ("invite" for students created
 * by a purchase or an import). Only the sha256 of the token is stored. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    const exists = tables.some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);
    if (!exists) {
      await q.createTable(TABLE, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        userId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        tokenHash: { type: S.STRING(64), allowNull: false },
        purpose: { type: S.ENUM('reset', 'invite'), allowNull: false },
        expiresAt: { type: S.DATE, allowNull: false },
        usedAt: { type: S.DATE, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = await q.showIndex(TABLE);
    if (!indexes.some(index => index.name === HASH_INDEX)) {
      await q.addIndex(TABLE, ['tokenHash'], { name: HASH_INDEX, unique: true });
    }
  },

  // Tokens are short-lived and can be requested again, so rolling back needs no confirmation.
  async down(q) {
    await q.dropTable(TABLE);
  }
};
