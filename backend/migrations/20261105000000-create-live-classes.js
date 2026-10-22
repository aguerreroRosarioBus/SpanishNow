'use strict';

async function index(q, table, fields, options = {}) {
  const name = `${table}_${fields.map(f => f.replace(/[A-Z]/g, c => '_' + c.toLowerCase())).join('_')}`;
  if (!(await q.showIndex(table)).some(i => i.name === name)) await q.addIndex(table, fields, { ...options, name });
}

module.exports = {
  async up(q, S) {
    await q.createTable('live_classes', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      teacherId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      courseId: { type: S.INTEGER, allowNull: true, references: { model: 'courses', key: 'id' }, onDelete: 'SET NULL' },
      title: { type: S.STRING(200), allowNull: false },
      status: { type: S.ENUM('draft', 'live', 'ended'), allowNull: false, defaultValue: 'draft' },
      joinCode: { type: S.STRING(32), allowNull: false, unique: true },
      allowStudentEdit: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      board: { type: S.JSON, allowNull: false },
      revision: { type: S.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      recentOperations: { type: S.JSON, allowNull: false },
      classroomCourseId: { type: S.STRING(128), allowNull: true },
      classroomCourseName: { type: S.STRING(200), allowNull: true },
      classroomAnnouncementId: { type: S.STRING(128), allowNull: true },
      classroomAnnouncementUrl: { type: S.STRING(500), allowNull: true },
      driveFileId: { type: S.STRING(128), allowNull: true },
      driveFileUrl: { type: S.STRING(500), allowNull: true },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false }
    });
    await index(q, 'live_classes', ['teacherId', 'updatedAt']);
    await index(q, 'live_classes', ['courseId', 'status']);
    await q.createTable('live_class_members', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      liveClassId: { type: S.INTEGER, allowNull: false, references: { model: 'live_classes', key: 'id' }, onDelete: 'CASCADE' },
      userId: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      lastSeenAt: { type: S.DATE, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false }
    });
    await index(q, 'live_class_members', ['liveClassId', 'userId'], { unique: true });
    await q.createTable('google_connections', {
      userId: { type: S.INTEGER, primaryKey: true, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      credentials: { type: S.TEXT, allowNull: true },
      email: { type: S.STRING(254), allowNull: true },
      scopes: { type: S.TEXT, allowNull: true },
      oauthStateHash: { type: S.STRING(64), allowNull: true, unique: true },
      oauthVerifier: { type: S.TEXT, allowNull: true },
      oauthExpiresAt: { type: S.DATE, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false }
    });
  },
  async down(q) {
    const tables = (await q.showAllTables()).map(String);
    const existing = ['google_connections', 'live_class_members', 'live_classes'].filter(t => tables.includes(t));
    if (process.env.CONFIRM_LIVE_CLASS_DATA_LOSS !== 'yes') {
      for (const table of existing) {
        const [[row]] = await q.sequelize.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        if (Number(row.total) > 0) throw new Error('Set CONFIRM_LIVE_CLASS_DATA_LOSS=yes to remove saved live classes and Google connections.');
      }
    }
    for (const table of existing) await q.dropTable(table);
  }
};
