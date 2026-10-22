// W02. Tablas aditivas independientes de las migraciones de pagos fechadas en noviembre.
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    const id = () => ({ type: S.INTEGER, primaryKey: true, autoIncrement: true });
    const date = () => ({ type: S.DATE(3), allowNull: false });
    const user = () => ({ type: S.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
    if (!tables.includes('legal_document_heads')) {
      await q.createTable('legal_document_heads', {
        documentKey: { type: S.STRING(32), primaryKey: true },
        lastVersion: { type: S.INTEGER, allowNull: false, defaultValue: 0 }
      });
      await q.bulkInsert('legal_document_heads', ['terms', 'privacy', 'refunds', 'package_terms'].map(documentKey => ({ documentKey, lastVersion: 0 })));
    }
    if (!tables.includes('legal_documents')) {
      await q.createTable('legal_documents', {
        id: id(), documentKey: { type: S.STRING(32), allowNull: false },
        version: { type: S.INTEGER, allowNull: false },
        content: { type: S.JSON, allowNull: false }, business: { type: S.JSON, allowNull: false },
        effectiveAt: date(), publishedAt: { type: S.DATE(3), allowNull: true },
        createdById: user(), publishedById: user(), createdAt: date()
      });
      await q.addIndex('legal_documents', ['documentKey', 'version'], { unique: true, name: 'legal_documents_version' });
      await q.addIndex('legal_documents', ['documentKey', 'publishedAt', 'effectiveAt'], { name: 'legal_documents_public' });
    }
    if (!tables.includes('course_expectations')) {
      await q.createTable('course_expectations', {
        courseId: { type: S.INTEGER, primaryKey: true, references: { model: 'courses', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        version: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        expectations: { type: S.JSON, allowNull: false }, updatedById: user(), createdAt: date(), updatedAt: date()
      });
    }
    if (!tables.includes('course_checkout_snapshots')) {
      await q.createTable('course_checkout_snapshots', {
        id: id(), courseId: { type: S.INTEGER, allowNull: false, references: { model: 'courses', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        userId: user(),
        // La tabla orders aún no existe en este punto del historial. Vínculo escrito solo por backend.
        orderId: { type: S.INTEGER, allowNull: true },
        snapshot: { type: S.JSON, allowNull: false }, locale: { type: S.ENUM('en', 'es'), allowNull: false },
        acceptedAt: { type: S.DATE(3), allowNull: true }, createdAt: date()
      });
      await q.addIndex('course_checkout_snapshots', ['orderId'], { unique: true, name: 'course_checkout_order' });
      await q.addIndex('course_checkout_snapshots', ['userId', 'courseId'], { name: 'course_checkout_user' });
    }
  },
  async down(q) {
    const tables = await q.showAllTables();
    const names = ['course_checkout_snapshots', 'course_expectations', 'legal_documents', 'legal_document_heads'];
    for (const name of names.filter(n => tables.includes(n) && n !== 'legal_document_heads')) {
      const [[row]] = await q.sequelize.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
      if (Number(row.n) && process.env.CONFIRM_SALES_LEGAL_DATA_LOSS !== 'yes') throw new Error('CONFIRM_SALES_LEGAL_DATA_LOSS=yes es obligatorio para borrar datos W02');
    }
    for (const name of names) if (tables.includes(name)) await q.dropTable(name);
  }
};
