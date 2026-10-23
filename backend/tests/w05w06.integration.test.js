// Integración W05 (compra real por checkout fake) ↔ W06 (agenda): el saldo lo mueve solo credits.apply.
const { randomUUID } = require('crypto');
const { Temporal } = require('@js-temporal/polyfill');
const M = require('../src/models');
const sessions = require('../src/services/classSessionService');
const credits = require('../src/services/classCredits');
const purchases = require('../src/services/classPurchases');
const checkout = require('../src/services/classCheckout');
const offers = require('../src/services/classOffers');
const events = require('../src/services/classPayments');
const chat = require('../src/services/chatService');
const { as, createUser } = require('./helpers/fixtures');
const { packageWorld } = require('./helpers/classPackages');

beforeEach(() => { process.env.FEATURE_CHAT = '1'; process.env.FEATURE_CLASS_PACKAGES = '1'; process.env.FEATURE_CLASS_SCHEDULING = '1'; process.env.PAYMENTS_FAKE = '1'; process.env.CHAT_UNREAD_EMAIL = '0'; });
afterEach(() => { for (const k of ['FEATURE_CHAT', 'FEATURE_CLASS_PACKAGES', 'FEATURE_CLASS_SCHEDULING', 'CHAT_UNREAD_EMAIL']) delete process.env[k]; process.env.PAYMENTS_FAKE = '0'; });

async function zones(teacher, students) {
  await teacher.update({ timeZone: 'America/New_York', timeZoneConfirmedAt: new Date() });
  for (const s of students) await s.update({ timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: new Date() });
}
function intent(days = 4, hour = '09:00') {
  const localStart = `${new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10)}T${hour}`;
  const timeZone = 'America/New_York';
  return { localStart, timeZone, offset: Temporal.PlainDateTime.from(localStart).toZonedDateTime(timeZone).offset, minutes: 50 };
}
async function pay(user, teacher, body) {
  const conversation = (await chat.startConversation(user, { teacherId: teacher.id })).conversation;
  const offer = (await offers.send(teacher, conversation.id, body, randomUUID())).offer;
  await checkout.start(user, offer.id, randomUUID());
  await checkout.completeFake(user, offer.id);
  return { offer, purchase: await M.ClassPackagePurchase.findOne({ where: { offerId: offer.id } }) };
}
const balance = id => credits.balance(id);

test('individual: compra real → reserva, pausa bloqueada con reserva, liberación, pausa y reanudación', async () => {
  const w = await packageWorld();
  await zones(w.teacher, [w.buyer]);
  const { purchase } = await pay(w.buyer, w.teacher, { templateVersionId: w.version.id });
  expect(await balance(purchase.id)).toMatchObject({ granted: 4, available: 4, reserved: 0 });
  const body = { intent: intent(), participants: [{ userId: w.buyer.id, purchaseId: purchase.id }] };
  const created = await sessions.create(w.teacher, body, randomUUID());
  const confirmed = await sessions.accept(w.buyer, created.session.id, 1);
  expect(confirmed.status).toBe('confirmed');
  expect(await balance(purchase.id)).toMatchObject({ available: 3, reserved: 1 });
  // W05 no deja pausar/cancelar una compra con reservas de W06
  await expect(purchases.change(w.buyer, purchase.id, 'pause', { version: (await purchase.reload()).version })).rejects.toMatchObject({ code: 'sessions_pending_resolution' });
  const cancelled = await sessions.cancel(w.buyer, confirmed.id, { version: confirmed.version, reason: 'Cambio de planes' });
  expect(cancelled.charge).toBe('none');
  expect(await balance(purchase.id)).toMatchObject({ available: 4, reserved: 0 });
  await purchase.reload();
  expect((await purchases.change(w.buyer, purchase.id, 'pause', { version: purchase.version })).status).toBe('paused');
  await expect(sessions.create(w.teacher, { ...body, intent: intent(5) }, randomUUID())).rejects.toMatchObject({ code: 'package_not_active' });
  await purchase.reload();
  await purchases.change(w.buyer, purchase.id, 'resume', { version: purchase.version });
  expect((await sessions.create(w.teacher, { ...body, intent: intent(5) }, randomUUID())).session.status).toBe('proposed');
  // el ledger solo tiene operaciones del contrato y coincide con las columnas de la compra
  await purchase.reload();
  const ops = (await M.ClassCreditLedger.findAll({ where: { purchaseId: purchase.id } })).map(e => e.operation);
  expect(new Set(ops)).toEqual(new Set(['grant', 'reserve', 'release']));
  expect(await balance(purchase.id)).toMatchObject({ available: purchase.unitsAvailable, reserved: purchase.unitsReserved });
});

test('reembolso confirmado por Hotmart con clase reservada: compra cancelada, revisión encolada y el docente aún libera', async () => {
  const w = await packageWorld();
  await zones(w.teacher, [w.buyer]);
  const { offer, purchase } = await pay(w.buyer, w.teacher, { templateVersionId: w.version.id });
  const body = { intent: intent(), participants: [{ userId: w.buyer.id, purchaseId: purchase.id }] };
  const created = await sessions.create(w.teacher, body, randomUUID());
  const confirmed = await sessions.accept(w.buyer, created.session.id, 1);
  const order = await M.ClassPackageOrder.findOne({ where: { offerId: offer.id } });
  await events.handleEvent({ ...checkout.fakeBody(order, offer, 'PURCHASE_REFUNDED', randomUUID()) }, { provider: 'fake' });
  await purchase.reload();
  expect(purchase.status).toBe('cancelled');
  expect(await balance(purchase.id)).toMatchObject({ available: 0, reserved: 1, refunded: 3 });
  expect(await M.OutboxJob.count({ where: { topic: 'review.refunded_with_reservations', aggregateId: purchase.id } })).toBe(1);
  // la reserva no se pierde ni se reinterpreta: cancelar la sesión la libera por credits.apply
  const r = await as(w.teacher).post(`/api/class-sessions/${confirmed.id}/cancel`).send({ version: confirmed.version, reason: 'Compra reembolsada' });
  expect(r.status).toBe(200);
  expect(await balance(purchase.id)).toMatchObject({ reserved: 0 });
  await expect(sessions.create(w.teacher, { ...body, intent: intent(6) }, randomUUID())).rejects.toMatchObject({ code: 'package_not_active' });
});

test.each([['group2-1x50-total', 2], ['group3-1x50-seat', 3]])('grupo %s: compra real por cohorte → sesión grupal reserva una unidad por compra', async (key, size) => {
  const w = await packageWorld({ key });
  const students = [w.buyer, w.other];
  if (size === 3) students.push(await createUser('student', 'w05w06-third'));
  await zones(w.teacher, students);
  for (const s of students) await chat.startConversation(s, { teacherId: w.teacher.id });
  const cohort = (await as(w.teacher).post('/api/teacher/class-cohorts', { templateVersionId: w.version.id, tentativeStartsAt: new Date(Date.now() + 240 * 3600000).toISOString(), invitedIds: students.map(s => s.id) })).body;
  for (const s of students) expect((await as(s).post(`/api/class-cohorts/${cohort.id}/invitation/accept`)).status).toBe(200);
  const bought = [];
  if (size === 2) bought.push((await pay(w.buyer, w.teacher, { templateVersionId: w.version.id, cohortId: cohort.id, beneficiaryIds: students.map(s => s.id) })).purchase);
  else for (const s of students) bought.push((await pay(s, w.teacher, { templateVersionId: w.version.id, cohortId: cohort.id, beneficiaryIds: [s.id] })).purchase);
  const body = { cohortId: cohort.id, intent: intent(), participants: students.map((s, i) => ({ userId: s.id, purchaseId: bought[size === 2 ? 0 : i].id })) };
  const created = await sessions.create(w.teacher, body, randomUUID());
  let session;
  for (const s of students) session = await sessions.accept(s, created.session.id, 1);
  expect(session.status).toBe('confirmed');
  for (const p of bought) expect(await balance(p.id)).toMatchObject({ granted: 1, available: 0, reserved: 1 });
  const done = await sessions.cancel(w.teacher, session.id, { version: session.version, reason: 'No puedo dictar' });
  expect(done.status).toBe('cancelled');
  for (const p of bought) expect(await balance(p.id)).toMatchObject({ available: 1, reserved: 0 });
});
