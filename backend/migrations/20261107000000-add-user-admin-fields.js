'use strict';

/**
 * Admin panel fields on users: permissions (JSON array of keys from src/config/permissions.js, on top of the role),
 * isTestAccount (accounts created from the panel to try the app, deletable with all their data) and suspendedAt
 * (suspended accounts cannot sign in). Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('users');
    if (!columns.permissions) await q.addColumn('users', 'permissions', { type: S.JSON, allowNull: true });
    if (!columns.isTestAccount) await q.addColumn('users', 'isTestAccount', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
    if (!columns.suspendedAt) await q.addColumn('users', 'suspendedAt', { type: S.DATE, allowNull: true });
  },

  async down(q) {
    const columns = await q.describeTable('users');
    for (const name of ['suspendedAt', 'isTestAccount', 'permissions']) {
      if (columns[name]) await q.removeColumn('users', name);
    }
  }
};
