'use strict';

const TABLE = 'certificates';

const hasTable = async q => (await q.showAllTables()).some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === TABLE);

/**
 * Certificates of completion: one per enrolment (unique enrollmentId) with a public, unique code.
 * The student, course and teacher names are copies taken when it is issued. The certificate is deleted with its enrolment.
 * Safe to re-run.
 */
module.exports = {
  async up(q, S) {
    if (!(await hasTable(q))) {
      await q.createTable(TABLE, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        enrollmentId: { type: S.INTEGER, allowNull: false, references: { model: 'enrollments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        code: { type: S.STRING(16), allowNull: false },
        studentName: { type: S.STRING(200), allowNull: false },
        courseTitle: { type: S.STRING(200), allowNull: false },
        teacherName: { type: S.STRING(200), allowNull: false },
        issuedAt: { type: S.DATE, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false }
      });
    }
    const indexes = (await q.showIndex(TABLE)).map(index => index.name);
    if (!indexes.includes('certificates_enrollment_unique')) await q.addIndex(TABLE, ['enrollmentId'], { name: 'certificates_enrollment_unique', unique: true });
    if (!indexes.includes('certificates_code_unique')) await q.addIndex(TABLE, ['code'], { name: 'certificates_code_unique', unique: true });
  },

  async down(q) {
    if (!(await hasTable(q))) return;
    const [[{ total }]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM certificates');
    if (Number(total) > 0 && process.env.CONFIRM_CERTIFICATES_DATA_LOSS !== 'yes') {
      throw new Error('Certificates exist; export them and set CONFIRM_CERTIFICATES_DATA_LOSS=yes before rollback');
    }
    await q.dropTable(TABLE);
  }
};
