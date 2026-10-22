const { randomUUID } = require('crypto');
const request = require('supertest');
const { app, as, createUser } = require('./helpers/fixtures');
const { newCourse } = require('./helpers/sales');
const { LegalDocument, LegalAcceptance, CourseCheckoutSnapshot, Order, AuditLog, User } = require('../src/models');
const sales = require('../src/services/salesExpectations');
const ids = [];
const draftInput = (documentKey = 'terms') => ({ documentKey, effectiveAt: '2026-01-01T00:00:00Z',
  content: { en: { title: 'Terms for testing', body: 'Fictional content for automated verification.' }, es: { title: 'Términos de prueba', body: 'Contenido ficticio para verificación automatizada.' } },
  business: { responsibleName: 'Responsable ficticio', address: 'Domicilio ficticio 123', contactEmail: 'contacto@negocio.invalid', privacyEmail: 'privacidad@negocio.invalid', commercialRetention: 'Plazo de prueba definido por el responsable ficticio.' } });
const expectations = () => Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(sales.FIELDS.map(k => [k, `${l}: ${k}`]))]));
const consent = docs => ({ accepted: true, documents: docs.filter(d => d.documentKey !== 'privacy').map(d => ({ documentKey: d.documentKey, documentVersion: String(d.version || d.documentVersion) })) });
let admin;
async function draft(input = draftInput()) {
  const r = await as(admin).post('/api/admin/legal-documents', input);
  expect(r.status).toBe(201); ids.push(r.body.id); return r.body;
}
async function publish(key = 'terms', overrides = {}) {
  const d = await draft({ ...draftInput(key), ...overrides });
  const r = await as(admin).post(`/api/admin/legal-documents/${d.id}/publish`, { documentVersion: d.documentVersion });
  expect(r.status).toBe(200); return r.body;
}
beforeAll(async () => { admin = await createUser('student', 'legal-editor'); await admin.update({ permissions: ['legal.manage'] }); });
afterEach(async () => { if (ids.length) await LegalDocument.destroy({ where: { id: ids.splice(0) } }); process.env.PAYMENTS_FAKE = '0'; });

describe('W02 legal', () => {
  test('capacidad explícita: rol docente, otro permiso, prueba e impersonación no habilitan publicación', async () => {
    const teacher = await createUser('teacher', 'legal-teacher');
    const other = await createUser('student', 'legal-other'); await other.update({ permissions: ['users.manage'] });
    const test = await createUser('teacher', 'legal-test'); await test.update({ permissions: ['legal.manage'], isTestAccount: true });
    for (const [user, status] of [[null, 401], [teacher, 403], [other, 403], [test, 403]]) {
      expect((await as(user).get('/api/admin/legal-documents')).status).toBe(status);
      expect((await as(user).post('/api/admin/legal-documents', draftInput())).status).toBe(status);
    }
    const token = require('jsonwebtoken').sign({ id: admin.id, role: admin.role, impersonatedBy: teacher.id }, process.env.JWT_SECRET);
    expect((await request(app).get('/api/admin/legal-documents').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });
  test('borradores privados y bloqueo de publicación por identidad/contacto, placeholders y traducción vacía', async () => {
    const input = draftInput(); input.business.address = ''; input.business.contactEmail = 'alguien@example.com'; input.content.en.body = '[TODO: completar]'; input.content.es.body = '';
    const d = await draft(input);
    expect((await request(app).get('/api/public/legal/terms')).status).toBe(404);
    const r = await as(admin).post(`/api/admin/legal-documents/${d.id}/publish`, { documentVersion: d.documentVersion });
    expect(r.status).toBe(400); expect(r.body.code).toBe('legal_publication_incomplete');
    expect(r.body.params.fields).toEqual(expect.arrayContaining(['business.address', 'business.contactEmail', 'content.en.body', 'content.es.body']));
    expect((await request(app).get(`/api/public/legal/terms?version=${d.documentVersion}`)).status).toBe(404);
  });
  test('ambas traducciones, versiones antiguas accesibles y reintento sin fecha ni auditoría nuevas', async () => {
    const first = await publish();
    const again = await as(admin).post(`/api/admin/legal-documents/${first.id}/publish`, { documentVersion: first.documentVersion });
    expect(again.body.publishedAt).toBe(first.publishedAt);
    expect(await AuditLog.count({ where: { entityId: first.id, action: 'legal.published' } })).toBe(1);
    const second = await publish('terms', { content: { en: { title: 'New terms', body: 'New content' }, es: { title: 'Nuevos términos', body: 'Contenido nuevo' } } });
    expect((await request(app).get('/api/public/legal/terms?locale=en')).body.documentVersion).toBe(second.documentVersion);
    expect((await request(app).get('/api/public/legal/terms?locale=es')).body.title).toBe('Nuevos términos');
    expect((await request(app).get(`/api/public/legal/terms?version=${first.documentVersion}`)).body.title).toBe('Terms for testing');
    expect((await as(admin).put(`/api/admin/legal-documents/${first.id}`, { content: {} })).status).toBe(404);
    expect((await as(admin).post(`/api/admin/legal-documents/${first.id}/publish`, { documentVersion: '999' })).status).toBe(409);
  });
  test('vigencia futura y publicación fuera de orden no revierten la vigente', async () => {
    const old = await draft(); const current = await publish(); const future = await publish('terms', { effectiveAt: '2099-01-01T00:00:00+03:00' });
    expect((await request(app).get('/api/public/legal/terms')).body.documentVersion).toBe(current.documentVersion);
    expect((await request(app).get(`/api/public/legal/terms?version=${future.documentVersion}`)).status).toBe(404);
    expect((await as(admin).post(`/api/admin/legal-documents/${old.id}/publish`, { documentVersion: old.documentVersion })).status).toBe(409);
  });
  test.each([{}, { ...draftInput(), effectiveAt: '2026-10-22T09:00' }, { ...draftInput(), role: 'admin' }, { ...draftInput(), content: { es: { title: 'x', body: 'y' } } }])('rechaza borrador inválido %j', async input => {
    expect((await as(admin).post('/api/admin/legal-documents', input)).status).toBe(400);
  });
  test('versiones concurrentes no se duplican', async () => {
    const r = await Promise.all([as(admin).post('/api/admin/legal-documents', draftInput()), as(admin).post('/api/admin/legal-documents', draftInput())]);
    expect(r.map(x => x.status)).toEqual([201, 201]); ids.push(...r.map(x => x.body.id)); expect(new Set(r.map(x => x.body.documentVersion)).size).toBe(2);
  });
  test('aceptación propia, explícita, UTC e idempotente; privacidad y marketing separados', async () => {
    const d = await publish(); const user = await createUser('student', 'legal-accept');
    const input = { documentKey: 'terms', documentVersion: d.documentVersion, locale: 'es', context: 'update', accepted: true };
    expect((await as(null).post('/api/me/legal-acceptances', input)).status).toBe(401);
    const [a,b] = await Promise.all([as(user).post('/api/me/legal-acceptances', input), as(user).post('/api/me/legal-acceptances', input)]);
    expect(a.status).toBe(201); expect(b.status).toBe(201); expect(a.body.id).toBe(b.body.id); expect(a.body.acceptedAt).toBe(b.body.acceptedAt);
    expect(a.body).toMatchObject({ userId: user.id, locale: 'es', acceptedAt: expect.stringMatching(/Z$/) });
    for (const bad of [{ ...input, accepted: false }, { ...input, documentKey: 'privacy' }, { ...input, userId: admin.id }, { ...input, marketing: true }, { ...input, acceptedAt: '2000-01-01T00:00:00Z' }]) expect((await as(user).post('/api/me/legal-acceptances', bad)).status).toBe(400);
    expect((await as(user).post('/api/me/legal-acceptances', { ...input, documentVersion: '999' })).status).toBe(409);
    expect((await as(user).post('/api/me/legal-acceptances', { ...input, context: 'checkout', contextType: 'course_checkout', contextId: 999999 })).status).toBe(404);
  });
  test('registro y aceptación atómicos, sin crear cuenta si falta casilla', async () => {
    const d = await publish(); const input = { name: 'Alumno ficticio', email: `${randomUUID()}@test.invalid`, password: 'password123', locale: 'es' };
    expect((await request(app).post('/api/auth/register').send(input)).body.code).toBe('legal_acceptance_required');
    expect(await User.count({ where: { email: input.email } })).toBe(0);
    const r = await request(app).post('/api/auth/register').send({ ...input, legalConsent: consent([d]) });
    expect(r.status).toBe(201);
    expect(await LegalAcceptance.findOne({ where: { userId: r.body.user.id, context: 'signup' } })).toMatchObject({ documentVersion: d.documentVersion, locale: 'es' });
  });
});

describe('W02 expectativas y snapshots', () => {
  test('editor dueño, control de versión y traducciones completas', async () => {
    const teacher = await createUser('teacher', 'sales-owner'); const other = await createUser('teacher', 'sales-other'); const c = await newCourse(teacher, { isPublished: true, price: 1999 }); const url = `/api/courses/${c.id}/expectations`;
    expect((await as(other).get(url)).status).toBe(404); expect((await as(other).put(url, { version: 0, expectations: expectations() })).status).toBe(404);
    expect((await as(teacher).get(url)).body).toEqual({ version: 0, expectations: null });
    const r = await as(teacher).put(url, { version: 0, expectations: expectations() }); expect(r.status).toBe(200); expect(r.body.version).toBe(1);
    expect((await as(teacher).put(url, { version: 0, expectations: expectations() })).status).toBe(409);
    const bad = expectations(); bad.es.audience = ''; expect((await as(teacher).put(url, { version: 1, expectations: bad })).status).toBe(400);
    const page = await request(app).get(`/api/public/courses/${c.slug}`); expect(page.body.commercial).toMatchObject({ version: 1, expectations: expectations(), price: 1999, currency: 'usd' }); expect(page.body.commercial.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  test('contrato W05 exige ambas traducciones y rechaza propiedades ajenas', () => {
    expect(sales.validateExpectations(expectations())).toEqual(expectations());
    for (const value of [{ en: expectations().en }, { ...expectations(), minutesPerSession: 50 }, { ...expectations(), en: { ...expectations().en, audience: {} } }]) expect(() => sales.validateExpectations(value)).toThrow();
  });
  test('página, checkout e historial coinciden tras cambios de catálogo/legal; precio del servidor', async () => {
    process.env.PAYMENTS_FAKE = '1'; const teacher = await createUser('teacher', 'snapshot-teacher'); const buyer = await createUser('student', 'snapshot-buyer'); const c = await newCourse(teacher, { isPublished: true, price: 9000 });
    await sales.save(teacher, c.id, { version: 0, expectations: expectations() }); const terms = await publish(); await publish('privacy'); const refunds = await publish('refunds');
    const view = (await request(app).get(`/api/public/courses/${c.slug}`)).body.commercial;
    const input = { courseId: c.id, locale: 'es', commercialHash: view.hash, legalConsent: consent([terms, refunds]), price: 1 };
    expect((await as(buyer).post('/api/checkout', { ...input, legalConsent: { ...input.legalConsent, accepted: false } })).status).toBe(400);
    expect((await as(buyer).post('/api/checkout', input)).status).toBe(200);
    const order = await Order.findOne({ where: { userId: buyer.id, courseId: c.id } }); expect(order.amount).toBe(9000);
    const evidence = await CourseCheckoutSnapshot.findOne({ where: { orderId: order.id } }); expect(evidence.snapshot).toEqual(view); expect(evidence.acceptedAt).toBeInstanceOf(Date);
    const rows = await LegalAcceptance.findAll({ where: { userId: buyer.id, context: 'checkout', contextId: evidence.id } }); expect(rows.map(r => r.documentKey).sort()).toEqual(['refunds', 'terms']);
    const changed = expectations(); changed.en.supportIncluded = 'New support'; await sales.save(teacher, c.id, { version: 1, expectations: changed }); await c.update({ price: 5000 }); await publish();
    const history = await as(buyer).get('/api/me/orders'); expect(history.body[0].commercial).toEqual(view); expect(history.body[0].amount).toBe(9000);
    const intruder = await createUser('student', 'snapshot-intruder'); expect((await as(intruder).get('/api/me/orders')).body).toEqual([]);
    expect((await as(intruder).post('/api/me/legal-acceptances', { documentKey: 'terms', documentVersion: terms.documentVersion, context: 'checkout', contextType: 'course_checkout', contextId: evidence.id, locale: 'en', accepted: true })).status).toBe(404);
  });
  test('precio cambiado invalida pantalla anterior antes de crear orden', async () => {
    process.env.PAYMENTS_FAKE = '1'; const teacher = await createUser('teacher', 'snapshot-stale'); const buyer = await createUser('student', 'stale-buyer'); const c = await newCourse(teacher, { isPublished: true, price: 1500 });
    const view = await sales.commercialView(c); await c.update({ price: 2500 }); const r = await as(buyer).post('/api/checkout', { courseId: c.id, commercialHash: view.hash });
    expect(r.status).toBe(409); expect(r.body.code).toBe('sales_snapshot_changed'); expect(await Order.count({ where: { courseId: c.id } })).toBe(0);
  });
  test('aceptación de actualización no elige una versión reemplazada', async () => {
    const doc = await publish(); const user = await createUser('student', 'stale-acceptance'); await publish();
    expect((await as(user).post('/api/me/legal-acceptances', { documentKey: 'terms', documentVersion: doc.documentVersion, context: 'update', locale: 'en', accepted: true })).status).toBe(409);
  });
});
