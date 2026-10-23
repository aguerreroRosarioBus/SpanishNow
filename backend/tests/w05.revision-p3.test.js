// Regresiones de los hallazgos P3 de la revisión cruzada de #43.
const { randomUUID } = require('crypto');
const M = require('../src/models');
const db = require('../src/config/database');
const credits = require('../src/services/classCredits');
const purchases = require('../src/services/classPurchases');
const refunds = require('../src/services/classRefunds');
const checkout = require('../src/services/classCheckout');
const offers = require('../src/services/classOffers');
const events = require('../src/services/classPayments');
const { as } = require('./helpers/fixtures');
const { packageWorld } = require('./helpers/classPackages');
const { chain } = require('./helpers/classSessions');

beforeEach(() => { process.env.FEATURE_CHAT = '1'; process.env.FEATURE_CLASS_PACKAGES = '1'; process.env.PAYMENTS_FAKE = '1'; });
afterEach(() => { delete process.env.FEATURE_CHAT; delete process.env.FEATURE_CLASS_PACKAGES; process.env.PAYMENTS_FAKE = '0'; jest.restoreAllMocks(); });
async function buy(w) {
  const { offer } = await offers.send(w.teacher, w.conversation.id, { templateVersionId: w.version.id }, randomUUID());
  await checkout.start(w.buyer, offer.id, randomUUID());
  return { offer, order: await M.ClassPackageOrder.findOne({ where: { offerId: offer.id } }) };
}
const reserve = (p, n = 1) => db.transaction(transaction => credits.apply({ purchaseId: p.id, operation: 'reserve', units: n, operationKey: `reserve:p3:${p.id}:${randomUUID()}` }, { transaction }));

test('P3-1: el reembolso parcial con reservas encola la revisión de reservas', async () => {
  const w = await packageWorld(); const { offer, order } = await buy(w);
  await checkout.completeFake(w.buyer, offer.id);
  const p = await M.ClassPackagePurchase.findOne({ where: { orderId: order.id } }); await reserve(p);
  const body = checkout.fakeBody(order, offer, 'PURCHASE_APPROVED', randomUUID()); body.data.purchase.status = 'PARTIALLY_REFUNDED';
  expect((await events.handleEvent(body, { provider: 'fake' })).needsReview).toBe(true);
  expect((await p.reload()).status).toBe('cancelled');
  expect(await M.OutboxJob.count({ where: { topic: 'review.refunded_with_reservations', aggregateId: p.id } })).toBe(1);
});

test('P3-2: fake-complete respeta el flag de paquetes', async () => {
  const w = await packageWorld(); const { offer } = await buy(w);
  process.env.FEATURE_CLASS_PACKAGES = '0';
  const r = await as(w.buyer).post(`/api/class-offers/${offer.id}/checkout/fake-complete`);
  expect(r.status).not.toBe(200);
  expect(await M.ClassPackagePurchase.count({ where: { offerId: offer.id } })).toBe(0);
});

test('P3-3: una plaza cancelada de un grupo de 3 no bloquea la pausa de su compra', async () => {
  const c = await chain({ size: 3 });
  const sessions = require('../src/services/classSessionService');
  const created = await sessions.create(c.teacher, c.body, randomUUID());
  await M.ClassSessionParticipant.update({ status: 'cancelled' }, { where: { sessionId: created.session.id, userId: c.students[0].id } });
  const p = await M.ClassPackagePurchase.findByPk(c.purchases[0].id);
  await p.update({ snapshot: { ...p.snapshot, policy: { maxPauses: 1, maxPauseHours: 168 } } }); // el fixture de W06 no trae la política de pausa de W05
  expect((await purchases.change(c.students[0], p.id, 'pause', { version: p.version })).status).toBe('paused');
});

test('P3-4: la Idempotency-Key de una solicitud no se reutiliza en otra compra', async () => {
  const w = await packageWorld();
  const make = async () => { const { offer } = await buy(w); await checkout.completeFake(w.buyer, offer.id); return M.ClassPackagePurchase.findOne({ where: { offerId: offer.id } }); };
  const a = await make(); const b = await make(); const key = randomUUID();
  const ask = async p => { const v = await refunds.ownPreview(w.buyer, p.id, 'voluntary'); return as(w.buyer).post(`/api/me/class-packages/${p.id}/refund-requests`, { version: v.version, quote: v.quote, type: 'voluntary', reason: 'Solicitud ficticia para revisar' }).set('Idempotency-Key', key); };
  expect((await ask(a)).status).toBe(200);
  const second = await ask(b);
  expect(second.status).toBe(409); expect(second.body.code).toBe('operation_key_conflict');
  expect(await M.AuditLog.count({ where: { action: 'refund.requested', entityId: b.id } })).toBe(0);
});

test('P3-5: las lecturas de saldo no toman locks si no hay nada que liquidar', async () => {
  const w = await packageWorld(); const { offer } = await buy(w); await checkout.completeFake(w.buyer, offer.id);
  const p = await M.ClassPackagePurchase.findOne({ where: { offerId: offer.id } });
  const spy = jest.spyOn(offers, 'teacherSettings');
  await purchases.list(w.buyer); await purchases.detail(w.buyer, p.id);
  expect(spy).not.toHaveBeenCalled();
  await p.update({ expiresAt: new Date(Date.now() - 1000) });
  await purchases.detail(w.buyer, p.id);
  expect(spy).toHaveBeenCalled(); expect((await p.reload()).status).toBe('expired');
});
