const { createUser, as } = require('./helpers/fixtures');
const { ClassPackageTemplate: Template, ClassPackageTemplateVersion: Version } = require('../src/models');
const { FIELDS, validateExpectations } = require('../src/services/salesExpectations');
const classCatalog = require('../src/services/classCatalog');
const initial = require('../src/domain/classInitialCatalog');

const importFor = teacher => as(teacher).post('/api/teacher/class-packages/import-initial');
// Deja la plantilla como la dejaba el catálogo anterior: versión vigente sin expectativas.
const strip = async (templateId, extra = {}) => {
  const template = await Template.findByPk(templateId);
  await Version.update({ expectations: null, ...extra }, { where: { id: template.currentVersionId } });
  return Version.findByPk(template.currentVersionId);
};
const current = async templateId => Version.findByPk((await Template.findByPk(templateId)).currentVersionId);

beforeEach(() => { process.env.FEATURE_CLASS_PACKAGES = '1'; process.env.PAYMENTS_FAKE = '1'; });
afterEach(() => { delete process.env.FEATURE_CLASS_PACKAGES; });

test('las seis variantes del catálogo inicial traen expectativas completas y propias de cada variante', () => {
  expect(initial).toHaveLength(6);
  for (const item of initial) {
    const checked = validateExpectations(item.expectations);
    expect(checked).toEqual(item.expectations);
    for (const l of ['en', 'es']) expect(Object.keys(item.expectations[l])).toEqual(FIELDS);
  }
  const by = key => initial.find(i => i.templateKey === key).expectations;
  expect(by('individual-1x30').en.contents).toBe('1 live private class of 30 minutes on Zoom, booked through SpanishNow. Use it within 30 days of purchase.');
  expect(by('individual-1x30').es.contents).toBe('1 clase individual en vivo de 30 minutos por Zoom, que reservas en SpanishNow. Úsala dentro de los 30 días posteriores a la compra.');
  expect(by('individual-4x50').en.contents).toBe('4 live private classes of 50 minutes on Zoom, booked through SpanishNow. Use them within 90 days of purchase.');
  expect(by('individual-4x50').es.contents).toBe('4 clases individuales en vivo de 50 minutos por Zoom, que reservas en SpanishNow. Úsalas dentro de los 90 días posteriores a la compra.');
  expect(by('group2-1x50-total').es.contents).toContain('para 2 estudiantes');
  expect(by('group2-1x50-total').es.contents).toContain('El precio cubre a los dos');
  expect(by('group3-1x50-seat').es.contents).toMatch(/^1 lugar en una clase grupal/);
  expect(by('group3-1x50-seat').es.contents).toContain('Úsalo');
  expect(by('individual-1x50').en.prerequisites).toContain('adapts each class to your level');
  expect(by('group2-1x50-total').en.prerequisites).toContain("adapts each class to the group's level");
  expect(by('group3-1x50-seat').es.prerequisites).toContain('al nivel del grupo');
  expect(by('group2-1x50-total').en.audience).toMatch(/^Two people/);
  expect(by('group3-1x50-seat').en.audience).toMatch(/up to 3 people/);
});

test('importar el catálogo guarda las expectativas por defecto y un paquete vinculado a Hotmart se activa sin escribirlas', async () => {
  const teacher = await createUser('teacher', 'default-expectations-1');
  const items = (await importFor(teacher)).body;
  expect(items).toHaveLength(6);
  for (const t of items) expect(validateExpectations(t.current.expectations)).toEqual(t.current.expectations);
  const t = items[0];
  const linked = await classCatalog.linkHotmart(teacher, t.id, { version: 1, url: 'https://pay.hotmart.com/DEF123?off=offdef', productId: 'DEF-1', offerCode: 'offdef' });
  expect(linked.current).toMatchObject({ version: 2, hotmartProductId: 'DEF-1', hotmartOfferCode: 'offdef' });
  expect(linked.current.expectations).toEqual(t.current.expectations);
  const activated = await classCatalog.setStatus(teacher, t.id, { status: 'active', version: linked.current.version });
  expect(activated.status).toBe('active');
});

test('al reimportar, una plantilla con versión vigente sin expectativas se repara conservando Hotmart y precio', async () => {
  const teacher = await createUser('teacher', 'default-expectations-2');
  const items = (await importFor(teacher)).body;
  const t = items[2];
  const old = await strip(t.id, { hotmartProductId: 'REP-1', hotmartOfferCode: 'offrep', hotmartCheckoutUrl: 'https://pay.hotmart.com/REP123', priceAmount: 4321 });
  const before = old.toJSON();
  const again = (await importFor(teacher)).body.find(r => r.id === t.id);
  expect(again.current.version).toBe(2);
  const repaired = (await current(t.id)).toJSON();
  expect(repaired.id).not.toBe(before.id);
  expect(repaired.expectations).toEqual(initial.find(i => i.templateKey === t.templateKey).expectations);
  const { id, version, expectations, createdAt, createdById, ...rest } = repaired;
  const { id: _i, version: _v, expectations: _e, createdAt: _c, createdById: _cb, ...restBefore } = before;
  expect(rest).toEqual(restBefore);
  expect(rest).toMatchObject({ hotmartProductId: 'REP-1', hotmartOfferCode: 'offrep', hotmartCheckoutUrl: 'https://pay.hotmart.com/REP123', priceAmount: 4321 });
  expect((await Version.findByPk(before.id)).expectations).toBeNull(); // la versión vieja no se reescribe
  // idempotente: otra importación no crea otra versión
  await importFor(teacher);
  expect(await Version.count({ where: { templateId: t.id } })).toBe(2);
});

test('al reimportar, no se tocan expectativas propias (ni parciales) ni plantillas archivadas', async () => {
  const teacher = await createUser('teacher', 'default-expectations-3');
  const items = (await importFor(teacher)).body;
  const own = items[0], partial = items[1], archived = items[3];
  const custom = Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(FIELDS.map(k => [k, `${l} propio ${k}`]))]));
  await Version.update({ expectations: custom }, { where: { id: own.current.id } });
  const parcial = Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(FIELDS.map(k => [k, k === 'audience' ? `${l} audiencia` : '']))]));
  await Version.update({ expectations: parcial }, { where: { id: partial.current.id } });
  await strip(archived.id);
  await Template.update({ status: 'archived' }, { where: { id: archived.id } });
  await importFor(teacher);
  expect((await current(own.id)).toJSON()).toMatchObject({ id: own.current.id, version: 1, expectations: custom });
  expect((await current(partial.id)).toJSON()).toMatchObject({ id: partial.current.id, version: 1, expectations: parcial });
  const arch = await current(archived.id);
  expect(arch.version).toBe(1); expect(arch.expectations).toBeNull();
});
