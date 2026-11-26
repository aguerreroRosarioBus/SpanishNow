// Migración 20261126000000: expectativas por defecto en versiones vigentes sin ellas. Se prueba en una base descartable
// migrada hasta la anterior, para no tocar los paquetes de las demás suites ni depender de su orden.
const { createMigrator } = require('../src/db/migrator');
const { TEST_DB_NAME } = require('./helpers/testEnv');
const { createScratchDb, dropScratchDb } = require('./helpers/scratchDb');
const { validateExpectations } = require('../src/services/salesExpectations');
const initial = require('../src/domain/classInitialCatalog');

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const PREVIOUS = '20261125000200-bind-class-package-hotmart-account.js';
const NAME = '20261126000000-default-class-package-expectations.js';
const DB = `${TEST_DB_NAME}_expectations_migration`;
const now = '2026-11-20 12:00:00';
let db, migrator;

const q = (sql, replacements) => db.query(sql, { replacements, type: 'SELECT' });
const run = (sql, replacements) => db.query(sql, { replacements });
const custom = { en: Object.fromEntries(['audience', 'prerequisites', 'objective', 'contents', 'selfStudy', 'outcomes', 'supportIncluded', 'supportExcluded'].map(k => [k, `own ${k}`])), es: {} };
custom.es = { ...custom.en };

async function template(teacherId, templateKey, status, item, { expectations, hotmart = true } = {}) {
  await run('INSERT INTO class_package_templates (teacherId, templateKey, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [teacherId, templateKey, status, now, now]);
  const [{ id: templateId }] = await q('SELECT LAST_INSERT_ID() AS id');
  await run(
    `INSERT INTO class_package_template_versions (templateId, version, nameEn, nameEs, modality, groupSize, billing, sessionsCount, minutesPerSession, seatsCovered,
       priceAmount, currency, validityHours, policyVersionId, hotmartProductId, hotmartOfferCode, hotmartCheckoutUrl, expectations, createdById, createdAt)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, 1, ?, ?, ?, ${expectations === undefined ? 'NULL' : 'CAST(? AS JSON)'}, ?, ?)`,
    [templateId, item.nameEn, item.nameEs, item.modality, item.groupSize, item.billing, item.sessionsCount, item.minutesPerSession, item.seatsCovered, item.priceAmount, item.validityHours,
      hotmart ? 'PROD-1' : null, hotmart ? 'offer-1' : null, hotmart ? 'https://pay.hotmart.com/ABC123' : null,
      ...(expectations === undefined ? [] : [JSON.stringify(expectations)]), teacherId, now]
  );
  const [{ id: versionId }] = await q('SELECT LAST_INSERT_ID() AS id');
  await run('UPDATE class_package_templates SET currentVersionId = ? WHERE id = ?', [versionId, templateId]);
  return { templateId, versionId };
}
const currentOf = async templateId => (await q(
  'SELECT v.* FROM class_package_templates t JOIN class_package_template_versions v ON v.id = t.currentVersionId WHERE t.id = ?', [templateId]))[0];
const versionsOf = async templateId => (await q('SELECT id FROM class_package_template_versions WHERE templateId = ?', [templateId])).length;

beforeAll(async () => {
  db = await createScratchDb(DB);
  migrator = await createMigrator(db, { logger: silent });
  await migrator.umzug.up({ to: PREVIOUS });
});
afterAll(async () => { await dropScratchDb(DB, db); });

test('repara solo las versiones vigentes sin expectativas del catálogo inicial y es idempotente', async () => {
  await run("INSERT INTO users (name, email, password, role, createdAt, updatedAt) VALUES ('Docente', 'doc@jest.test', 'x', 'teacher', ?, ?)", [now, now]);
  const [{ id: teacherId }] = await q('SELECT LAST_INSERT_ID() AS id');
  await run('INSERT INTO class_policy_versions (version, rules, createdById, createdAt) VALUES (1, ?, NULL, ?)', [JSON.stringify({}), now]);
  const [policy] = await q('SELECT id FROM class_policy_versions');
  expect(policy.id).toBe(1);

  const [a, b, c, d, e, f] = initial;
  const sqlNull = await template(teacherId, a.templateKey, 'draft', a);                       // expectations SQL NULL
  const jsonNull = await template(teacherId, b.templateKey, 'paused', b, { expectations: null }); // JSON 'null'
  const withOwn = await template(teacherId, c.templateKey, 'draft', c, { expectations: custom });
  const archived = await template(teacherId, d.templateKey, 'archived', d);
  const noHotmart = await template(teacherId, e.templateKey, 'draft', e, { hotmart: false });
  const foreign = await template(teacherId, 'mi-paquete', 'draft', f);                       // clave fuera del catálogo inicial

  expect((await migrator.umzug.up({ to: NAME })).map(m => m.name)).toEqual([NAME]);

  for (const [row, item] of [[sqlNull, a], [jsonNull, b], [noHotmart, e]]) {
    const before = (await q('SELECT * FROM class_package_template_versions WHERE id = ?', [row.versionId]))[0];
    const now2 = await currentOf(row.templateId);
    expect(now2.version).toBe(2);
    expect(now2.id).not.toBe(row.versionId);
    // La versión nueva copia todo salvo id, version, expectativas y fecha; la anterior queda intacta.
    const strip = ({ id, version, expectations, createdAt, ...rest }) => rest;
    expect(strip(now2)).toEqual(strip(before));
    const expectations = typeof now2.expectations === 'string' ? JSON.parse(now2.expectations) : now2.expectations;
    expect(validateExpectations(expectations)).toEqual(item.expectations);
    expect(await versionsOf(row.templateId)).toBe(2);
  }
  expect(await currentOf(sqlNull.templateId)).toMatchObject({ hotmartProductId: 'PROD-1', hotmartOfferCode: 'offer-1', hotmartCheckoutUrl: 'https://pay.hotmart.com/ABC123', priceAmount: a.priceAmount, policyVersionId: 1, createdById: teacherId });
  expect((await currentOf(noHotmart.templateId)).hotmartProductId).toBeNull();
  expect((await q('SELECT expectations FROM class_package_template_versions WHERE id = ?', [sqlNull.versionId]))[0].expectations).toBeNull();

  for (const row of [withOwn, archived, foreign]) {
    expect((await currentOf(row.templateId)).id).toBe(row.versionId);
    expect(await versionsOf(row.templateId)).toBe(1);
  }
  expect((await migrator.umzug.pending()).map(m => m.name)).not.toContain(NAME);
  // Reaplicar el cuerpo de la migración tampoco duplica versiones.
  await require(`../migrations/${NAME}`).up(db.getQueryInterface(), require('sequelize').Sequelize);
  for (const row of [sqlNull, jsonNull, noHotmart]) expect(await versionsOf(row.templateId)).toBe(2);
});
