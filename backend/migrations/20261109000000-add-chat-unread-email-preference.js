'use strict';

/**
 * W04 (CHAT-09): users.chatUnreadEmail, the per-user switch of the grouped email about unread chat messages.
 * true by default (the email never carries the message text). Exposed through /api/me/preferences. Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('users');
    if (!columns.chatUnreadEmail) await q.addColumn('users', 'chatUnreadEmail', { type: S.BOOLEAN, allowNull: false, defaultValue: true });
  },

  async down(q) {
    const columns = await q.describeTable('users');
    if (columns.chatUnreadEmail) await q.removeColumn('users', 'chatUnreadEmail');
  }
};
