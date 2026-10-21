// Affiliates: teacher CRUD, attribution at checkout, commission (cents, rounded down, fixed at fulfilment), refunds (idempotent),
// per-currency stats, payouts and the public dashboard (never any buyer data).
const Stripe = require('stripe');
const request = require('supertest');
const { randomUUID } = require('crypto');
const { Order, Affiliate, AffiliatePayout, User, Coupon } = require('../src/models');
const affiliates = require('../src/services/affiliateService');
const { fulfillOrder, registerRefund } = require('../src/services/orderService');
const { clearOutbox } = require('../src/services/mailService');
const { app, as, createUser } = require('./helpers/fixtures');
const { publish, newCourse } = require('./helpers/sales');

const sessionIdOf = url => new URL(url).searchParams.get('session_id');

describe('affiliates', () => {
  let teacher; let otherTeacher; let usd; let eur; let foreign;
  beforeAll(async () => {
    [teacher, otherTeacher] = await Promise.all([createUser('teacher', 'aff-owner'), createUser('teacher', 'aff-other')]);
    usd = await publish(await newCourse(teacher), { price: 5000, currency: 'usd' });
    eur = await publish(await newCourse(teacher), { price: 2000, currency: 'eur' });
    foreign = await publish(await newCourse(otherTeacher), { price: 5000, currency: 'usd' });
  });
  beforeEach(() => { process.env.PAYMENTS_FAKE = '1'; clearOutbox(); });
  afterEach(() => { process.env.PAYMENTS_FAKE = '0'; });

  const create = async (owner = teacher, values = {}) => {
    const res = await as(owner).post('/api/teacher/affiliates', { name: 'Ana Afiliada', email: `aff-${randomUUID()}@jest.test`, commissionPercent: 20, ...values });
    if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  /** Buys through the (fake) checkout, optionally with a code and coupon. Returns the stored order. */
  async function buy({ course = usd, code, email = `buyer-${randomUUID()}@jest.test`, couponCode } = {}) {
    const res = await as(null).post('/api/checkout', { courseId: course.id, email, ...(code !== undefined ? { affiliateCode: code } : {}), ...(couponCode ? { couponCode } : {}) });
    if (res.status !== 200) throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { order: await Order.findOne({ where: { providerSessionId: sessionIdOf(res.body.url) } }), email };
  }

  describe('the maths', () => {
    test('commissionFor rounds down on what the buyer kept; never negative', () => {
      expect(affiliates.commissionFor(5000, 0, 20)).toBe(1000);
      expect(affiliates.commissionFor(1999, 0, 15)).toBe(299); // 299.85
      expect(affiliates.commissionFor(1, 0, 90)).toBe(0);
      expect(affiliates.commissionFor(5000, 1250, 20)).toBe(750);
      expect(affiliates.commissionFor(5000, 5000, 20)).toBe(0);
      expect(affiliates.commissionFor(99999999, 0, 90)).toBe(89999999);
      expect(affiliates.commissionFor(100, 500, 20)).toBe(0);
    });

    test('dashboard tokens are 32 random bytes in base64url and never repeat; the comparison is exact', () => {
      const tokens = new Set(Array.from({ length: 200 }, () => affiliates.generateToken()));
      expect(tokens.size).toBe(200);
      for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from([...tokens][0], 'base64url')).toHaveLength(32);
      expect(affiliates.safeEqual('abc', 'abc')).toBe(true);
      expect(affiliates.safeEqual('abc', 'abd')).toBe(false);
      expect(affiliates.safeEqual('abc', 'abcd')).toBe(false);
    });

    test('generated codes look like NAME-XXXX and satisfy the code pattern', () => {
      for (const name of ['Ana López', 'Zoë', '  ', '李', 'A'.repeat(80)]) expect(affiliates.generateCode(name)).toMatch(affiliates.CODE_PATTERN);
      expect(affiliates.generateCode('Ana López')).toMatch(/^ANALOPEZ-[A-Z2-9]{4}$/);
    });
  });

  describe('teacher CRUD', () => {
    test('teachers only, with a token', async () => {
      expect((await as(null).get('/api/teacher/affiliates')).status).toBe(401);
      expect((await as(await createUser('student', 'aff-student')).get('/api/teacher/affiliates')).status).toBe(403);
      expect((await as(await createUser('student', 'aff-student2')).post('/api/teacher/affiliates', {})).status).toBe(403);
    });

    test('creates with a generated code and a secret token (returned to the owner), lists only the own ones, with stats', async () => {
      const created = await as(teacher).post('/api/teacher/affiliates', { name: '  Beto  Promotor ', email: ' BETO@Jest.Test ', commissionPercent: 25, notes: ' vip ' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ name: 'Beto Promotor', email: 'beto@jest.test', commissionPercent: 25, active: true, notes: 'vip', stats: [] });
      expect(created.body.code).toMatch(/^BETOPROMOTOR-[A-Z2-9]{4}$/);
      expect(created.body.dashboardToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const theirs = await create(otherTeacher);
      const list = await as(teacher).get('/api/teacher/affiliates');
      expect(list.status).toBe(200);
      expect(list.body.map(a => a.id)).toContain(created.body.id);
      expect(list.body.map(a => a.id)).not.toContain(theirs.id);
      expect(list.body.find(a => a.id === created.body.id)).toMatchObject({ code: created.body.code, stats: [] });
    });

    test('a code chosen by the teacher is normalized; a duplicate is 409; invalid input is 400', async () => {
      const code = `Ana-${randomUUID().slice(0, 6)}`;
      const ok = await create(teacher, { code });
      expect(ok.code).toBe(code.toUpperCase());
      expect((await as(otherTeacher).post('/api/teacher/affiliates', { name: 'X', email: 'x@jest.test', commissionPercent: 10, code })).status).toBe(409);
      const bad = async (values, pattern) => {
        const res = await as(teacher).post('/api/teacher/affiliates', { name: 'Ok', email: 'ok@jest.test', commissionPercent: 10, ...values });
        expect([res.status, res.body.error]).toEqual([400, expect.stringMatching(pattern)]);
      };
      await bad({ name: '' }, /name/);
      await bad({ name: 'x'.repeat(101) }, /name/);
      await bad({ name: 12 }, /name/);
      await bad({ email: 'nope' }, /email/);
      await bad({ commissionPercent: 0 }, /commissionPercent/);
      await bad({ commissionPercent: 91 }, /commissionPercent/);
      await bad({ commissionPercent: 12.5 }, /commissionPercent/);
      await bad({ commissionPercent: 'diez' }, /commissionPercent/);
      await bad({ commissionPercent: undefined }, /commissionPercent/);
      await bad({ code: '-bad-' }, /code/);
      await bad({ code: 'a b' }, /code/);
      await bad({ active: 'maybe' }, /active/);
      await bad({ notes: 'n'.repeat(2001) }, /notes/);
      expect((await as(teacher).post('/api/teacher/affiliates', { name: 'Ok', email: 'ok@jest.test', commissionPercent: 90 })).status).toBe(201);
      expect((await as(teacher).post('/api/teacher/affiliates', { name: 'Ok', email: 'ok@jest.test', commissionPercent: 1 })).status).toBe(201);
    });

    test('PUT edits name, email, percent, active and notes; the code and the token never change; only the owner', async () => {
      const a = await create();
      const res = await as(teacher).put(`/api/teacher/affiliates/${a.id}`, { name: 'Nuevo', commissionPercent: 30, active: false, notes: null, code: 'HACK-1', dashboardToken: 'x'.repeat(43) });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: a.id, name: 'Nuevo', commissionPercent: 30, active: false, notes: null, code: a.code, dashboardToken: a.dashboardToken });
      expect((await as(teacher).put(`/api/teacher/affiliates/${a.id}`, { commissionPercent: 99 })).status).toBe(400);
      expect((await as(otherTeacher).put(`/api/teacher/affiliates/${a.id}`, { name: 'Robo' })).status).toBe(403);
      expect((await as(teacher).put('/api/teacher/affiliates/99999999', {})).status).toBe(404);
      expect((await as(teacher).put('/api/teacher/affiliates/abc', {})).status).toBe(404);
      expect((await Affiliate.findByPk(a.id)).name).toBe('Nuevo');
    });

    test('regenerating the token returns a new one, invalidates the old link, and only for the owner', async () => {
      const a = await create();
      expect((await as(null).get(`/api/public/affiliate-dashboard/${a.dashboardToken}`)).status).toBe(200);
      expect((await as(otherTeacher).post(`/api/teacher/affiliates/${a.id}/regenerate-token`)).status).toBe(403);
      const res = await as(teacher).post(`/api/teacher/affiliates/${a.id}/regenerate-token`);
      expect(res.status).toBe(200);
      expect(res.body.dashboardToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(res.body.dashboardToken).not.toBe(a.dashboardToken);
      expect((await as(null).get(`/api/public/affiliate-dashboard/${a.dashboardToken}`)).status).toBe(404);
      expect((await as(null).get(`/api/public/affiliate-dashboard/${res.body.dashboardToken}`)).status).toBe(200);
    });

    test('DELETE removes an affiliate without sales; with sales or payouts it answers 409 and deactivates it', async () => {
      const clean = await create();
      expect((await as(otherTeacher).delete(`/api/teacher/affiliates/${clean.id}`)).status).toBe(403);
      expect((await as(teacher).delete(`/api/teacher/affiliates/${clean.id}`)).status).toBe(204);
      expect(await Affiliate.findByPk(clean.id)).toBeNull();
      expect((await as(teacher).delete(`/api/teacher/affiliates/${clean.id}`)).status).toBe(404);

      const sold = await create();
      await buy({ code: sold.code });
      const res = await as(teacher).delete(`/api/teacher/affiliates/${sold.id}`);
      expect([res.status, res.body.deactivated]).toEqual([409, true]);
      expect((await Affiliate.findByPk(sold.id)).active).toBe(false);

      const paid = await create();
      await as(teacher).post(`/api/teacher/affiliates/${paid.id}/payouts`, { amount: 100, currency: 'usd', paidAt: '2026-01-01' });
      expect((await as(teacher).delete(`/api/teacher/affiliates/${paid.id}`)).status).toBe(409);
      expect(await AffiliatePayout.count({ where: { affiliateId: paid.id } })).toBe(1);
    });
  });

  describe('attribution and commission at checkout', () => {
    test('the order stores the affiliate; the commission is floor(amount x percent) in cents, pending, with the percent of that moment', async () => {
      const a = await create(teacher, { commissionPercent: 20 });
      const { order } = await buy({ code: a.code });
      expect(order).toMatchObject({ affiliateId: a.id, status: 'paid', amount: 5000, commissionPercent: 20, commissionAmount: 1000, commissionStatus: 'pending' });

      const odd = await publish(await newCourse(teacher), { price: 1999, currency: 'usd' });
      await as(teacher).put(`/api/teacher/affiliates/${a.id}`, { commissionPercent: 15 });
      const second = (await buy({ course: odd, code: a.code })).order;
      expect(second).toMatchObject({ commissionPercent: 15, commissionAmount: 299 }); // 299.85 rounds down
      // the earlier order keeps its 20 %: a change only affects later sales
      expect(await Order.findByPk(order.id)).toMatchObject({ commissionPercent: 20, commissionAmount: 1000 });
    });

    test('the code is case-insensitive and trimmed', async () => {
      const a = await create();
      const { order } = await buy({ code: ` ${a.code.toLowerCase()} ` });
      expect(order.affiliateId).toBe(a.id);
    });

    test('an unknown, malformed, non-text, inactive or other teacher\'s code is ignored: the purchase works, with no affiliate', async () => {
      const inactive = await create();
      await as(teacher).put(`/api/teacher/affiliates/${inactive.id}`, { active: false });
      const foreignAffiliate = await create(otherTeacher);
      for (const code of ['NOPE-0000', '', '   ', 'a b!', inactive.code, foreignAffiliate.code, 12345, null, { x: 1 }, ['A']]) {
        const { order } = await buy({ code });
        expect([JSON.stringify(code), order.status, order.affiliateId, order.commissionAmount, order.commissionStatus]).toEqual([JSON.stringify(code), 'paid', null, 0, 'none']);
      }
      expect((await buy({ course: foreign, code: foreignAffiliate.code })).order.affiliateId).toBe(foreignAffiliate.id); // the owner's own course works
    });

    test('the commission is on what was charged after a coupon; a 100 % coupon gives none', async () => {
      const a = await create(teacher, { commissionPercent: 10 });
      await Coupon.create({ teacherId: teacher.id, code: `HALF-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 50 });
      const half = await Coupon.findOne({ where: { teacherId: teacher.id, percentOff: 50 }, order: [['id', 'DESC']] });
      const { order } = await buy({ code: a.code, couponCode: half.code });
      expect(order).toMatchObject({ amount: 2500, discountAmount: 2500, commissionAmount: 250, commissionStatus: 'pending' });

      const free = await Coupon.create({ teacherId: teacher.id, code: `FREE-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 100 });
      const gift = (await buy({ code: a.code, couponCode: free.code })).order;
      expect(gift).toMatchObject({ provider: 'coupon', status: 'paid', amount: 0, affiliateId: a.id, commissionAmount: 0, commissionStatus: 'none' });
    });

    test('a buyer who is the affiliate (same email) earns no commission', async () => {
      const a = await create();
      const { order } = await buy({ code: a.code, email: a.email.toUpperCase() });
      expect(order).toMatchObject({ status: 'paid', commissionAmount: 0, commissionStatus: 'none', commissionPercent: null });
    });

    test('the quote accepts affiliateCode and ignores it (same price)', async () => {
      const a = await create();
      const coupon = await Coupon.create({ teacherId: teacher.id, code: `Q-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 10 });
      const plain = await as(null).post('/api/checkout/quote', { courseId: usd.id, couponCode: coupon.code });
      const withCode = await as(null).post('/api/checkout/quote', { courseId: usd.id, couponCode: coupon.code, affiliateCode: a.code });
      const garbage = await as(null).post('/api/checkout/quote', { courseId: usd.id, couponCode: coupon.code, affiliateCode: { x: 1 } });
      expect([withCode.status, garbage.status]).toEqual([200, 200]);
      expect(withCode.body).toEqual(plain.body);
      expect(garbage.body).toEqual(plain.body);
    });

    test('a logged-in student buying with a code is attributed too', async () => {
      const a = await create();
      const student = await createUser('student', 'aff-buyer');
      const res = await as(student).post('/api/checkout', { courseId: usd.id, affiliateCode: a.code });
      expect(res.status).toBe(200);
      const order = await Order.findOne({ where: { providerSessionId: sessionIdOf(res.body.url) } });
      expect(order).toMatchObject({ affiliateId: a.id, userId: student.id, commissionAmount: 1000 });
    });

    test('fulfilling the same order again does not change the commission (replays)', async () => {
      const a = await create();
      const { order } = await buy({ code: a.code });
      await as(teacher).put(`/api/teacher/affiliates/${a.id}`, { commissionPercent: 50 });
      const again = await fulfillOrder(order.id, { email: order.email });
      expect(again.alreadyPaid).toBe(true);
      expect(await Order.findByPk(order.id)).toMatchObject({ commissionPercent: 20, commissionAmount: 1000 });
    });
  });

  describe('refunds adjust the commission', () => {
    const deliver = payload => {
      const body = JSON.stringify(payload);
      const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET });
      return request(app).post('/api/payments/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(body);
    };
    const refundEvent = (intent, refunded, total = false) => ({ id: `evt_${randomUUID()}`, type: 'charge.refunded',
      data: { object: { id: `ch_${randomUUID()}`, payment_intent: intent, amount: 5000, amount_refunded: refunded, refunded: total } } });
    /** A paid Stripe order of the affiliate (through the real fulfilment). */
    async function stripeOrder(a, amount = 5000) {
      const order = await Order.create({ courseId: usd.id, amount, originalAmount: amount, currency: 'usd', provider: 'stripe', providerSessionId: `cs_${randomUUID()}`, affiliateId: a.id });
      const intent = `pi_${randomUUID()}`;
      await fulfillOrder(order, { email: `stripe-${randomUUID()}@jest.test`, paymentId: intent });
      return { id: order.id, intent, reload: () => Order.findByPk(order.id) };
    }

    test('a partial refund reduces the commission in proportion; replays, smaller later events and the same amount change nothing', async () => {
      const a = await create(teacher, { commissionPercent: 20 });
      const o = await stripeOrder(a);
      expect(await o.reload()).toMatchObject({ commissionAmount: 1000, commissionStatus: 'pending' });
      await deliver(refundEvent(o.intent, 1250));
      expect(await o.reload()).toMatchObject({ status: 'paid', refundedAmount: 1250, commissionAmount: 750, commissionStatus: 'pending' }); // 3750 kept x 20 %
      await deliver(refundEvent(o.intent, 1250)); // replay
      await deliver(refundEvent(o.intent, 500)); // delivered late: cumulative never goes down
      expect(await o.reload()).toMatchObject({ refundedAmount: 1250, commissionAmount: 750 });
      await deliver(refundEvent(o.intent, 3333));
      expect(await o.reload()).toMatchObject({ refundedAmount: 3333, commissionAmount: 333 }); // floor(1667 x .2) = 333.4
    });

    test('a total refund voids the commission; replaying the event and the purchase event does not bring it back', async () => {
      const a = await create(teacher, { commissionPercent: 20 });
      const o = await stripeOrder(a);
      const event = refundEvent(o.intent, 5000, true);
      await deliver(event);
      expect(await o.reload()).toMatchObject({ status: 'refunded', commissionAmount: 0, commissionStatus: 'void' });
      await deliver(event);
      expect(await o.reload()).toMatchObject({ commissionAmount: 0, commissionStatus: 'void' });
      const result = await registerRefund(o.id, { full: true });
      expect(result).toMatchObject({ applied: false, reason: 'already_refunded' });
      expect(await o.reload()).toMatchObject({ commissionAmount: 0, commissionStatus: 'void' });
    });

    test('partial refunds that add up to the whole void it; the same webhook and manual path agree', async () => {
      const a = await create();
      const viaWebhook = await stripeOrder(a);
      await deliver(refundEvent(viaWebhook.intent, 2000));
      await deliver(refundEvent(viaWebhook.intent, 5000));
      expect(await viaWebhook.reload()).toMatchObject({ status: 'refunded', commissionAmount: 0, commissionStatus: 'void' });

      const { order } = await buy({ code: a.code }); // fake order, refunded by hand from the teacher panel
      const res = await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ commissionAmount: 0, commissionStatus: 'void', affiliate: { id: a.id, code: a.code } });
      expect((await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {})).status).toBe(409);
      expect(await Order.findByPk(order.id)).toMatchObject({ commissionAmount: 0, commissionStatus: 'void' });
    });

    test('an order without commission (none) stays none after a refund; an order without affiliate is untouched', async () => {
      const a = await create();
      const self = (await buy({ code: a.code, email: a.email })).order;
      await registerRefund(self.id, { refundedAmount: 1000 });
      expect(await Order.findByPk(self.id)).toMatchObject({ refundedAmount: 1000, commissionAmount: 0, commissionStatus: 'none' });
      const plain = (await buy()).order;
      await registerRefund(plain.id, { full: true });
      expect(await Order.findByPk(plain.id)).toMatchObject({ status: 'refunded', affiliateId: null, commissionAmount: 0, commissionStatus: 'none' });
    });
  });

  describe('stats, payouts and orders', () => {
    let a; let seen;
    beforeAll(async () => {
      process.env.PAYMENTS_FAKE = '1';
      a = await create(teacher, { commissionPercent: 20, name: 'Stats Person' });
      const second = await create(teacher, { commissionPercent: 10 });
      seen = {
        usd1: (await buy({ code: a.code, email: 'comprador-secreto@jest.test' })).order, // 5000 usd -> 1000
        usd2: (await buy({ code: a.code })).order, // 5000 usd -> 1000, refunded fully below
        eur1: (await buy({ course: eur, code: a.code })).order, // 2000 eur -> 400
        free: (await buy({ code: a.code, couponCode: (await Coupon.create({ teacherId: teacher.id, code: `S100-${randomUUID().slice(0, 5).toUpperCase()}`, percentOff: 100 })).code })).order,
        other: (await buy({ code: second.code })).order
      };
      await registerRefund(seen.usd2.id, { full: true });
      process.env.PAYMENTS_FAKE = '0';
    });

    const own = async () => (await as(teacher).get('/api/teacher/affiliates')).body.find(x => x.id === a.id);

    test('stats are per currency, grouped in SQL: orders, net sales, pending commission, paid and owed', async () => {
      expect((await own()).stats).toEqual([
        { currency: 'eur', orders: 1, sales: 2000, commission: 400, paid: 0, owed: 400 },
        { currency: 'usd', orders: 2, sales: 5000, commission: 1000, paid: 0, owed: 1000 } // usd2 refunded: counts as an order, 0 sales, void commission; the free one is not counted
      ]);
    });

    test('payouts: validated, listed newest first, subtracted from owed per currency; a currency with only payouts still appears; delete restores', async () => {
      const url = `/api/teacher/affiliates/${a.id}/payouts`;
      const bad = async (body, pattern) => {
        const res = await as(teacher).post(url, body);
        expect([res.status, res.body.error]).toEqual([400, expect.stringMatching(pattern)]);
      };
      await bad({ currency: 'usd' }, /amount/);
      await bad({ amount: 0, currency: 'usd' }, /amount/);
      await bad({ amount: 10.5, currency: 'usd' }, /amount/);
      await bad({ amount: 100, currency: 'dollars' }, /currency/);
      await bad({ amount: 100, currency: 'usd', paidAt: 'ayer' }, /paidAt/);
      await bad({ amount: 100, currency: 'usd', paidAt: '2999-01-01' }, /future/);
      await bad({ amount: 100, currency: 'usd', note: 'x'.repeat(301) }, /note/);
      expect((await as(otherTeacher).post(url, { amount: 100, currency: 'usd' })).status).toBe(403);
      expect((await as(otherTeacher).get(url)).status).toBe(403);

      const p1 = await as(teacher).post(url, { amount: 600, currency: 'USD', paidAt: '2026-02-01', note: 'PayPal' });
      expect(p1.status).toBe(201);
      expect(p1.body).toMatchObject({ amount: 600, currency: 'usd', note: 'PayPal', paidAt: '2026-02-01T00:00:00.000Z' });
      const p2 = await as(teacher).post(url, { amount: 300, currency: 'usd', paidAt: '2026-03-01' });
      const p3 = await as(teacher).post(url, { amount: 50, currency: 'gbp', paidAt: '2026-03-02' });
      expect((await as(teacher).get(url)).body.map(p => p.id)).toEqual([p3.body.id, p2.body.id, p1.body.id]);

      expect((await own()).stats).toEqual([
        { currency: 'eur', orders: 1, sales: 2000, commission: 400, paid: 0, owed: 400 },
        { currency: 'gbp', orders: 0, sales: 0, commission: 0, paid: 50, owed: -50 },
        { currency: 'usd', orders: 2, sales: 5000, commission: 1000, paid: 900, owed: 100 }
      ]);

      expect((await as(teacher).delete(`${url}/${p2.body.id}`)).status).toBe(204);
      expect((await as(teacher).delete(`${url}/${p2.body.id}`)).status).toBe(404);
      expect((await as(otherTeacher).delete(`${url}/${p1.body.id}`)).status).toBe(403);
      const another = await create();
      expect((await as(teacher).delete(`/api/teacher/affiliates/${another.id}/payouts/${p1.body.id}`)).status).toBe(404); // not that affiliate's payout
      expect((await own()).stats.find(s => s.currency === 'usd')).toMatchObject({ paid: 600, owed: 400 });
    });

    test('/teacher/orders and the CSV show the affiliate and the commission', async () => {
      const list = await as(teacher).get('/api/teacher/orders?pageSize=100');
      const row = list.body.rows.find(r => r.id === seen.usd1.id);
      expect(row).toMatchObject({ affiliate: { id: a.id, name: 'Stats Person', code: a.code }, commissionAmount: 1000, commissionStatus: 'pending' });
      expect(list.body.rows.find(r => r.id === seen.usd2.id)).toMatchObject({ commissionAmount: 0, commissionStatus: 'void' });
      const plain = (await buy()).order;
      expect((await as(teacher).get('/api/teacher/orders?pageSize=100')).body.rows.find(r => r.id === plain.id)).toMatchObject({ affiliate: null, commissionAmount: 0 });

      const csv = await as(teacher).get('/api/teacher/orders/export.csv');
      const lines = csv.text.slice(1).split('\r\n');
      expect(lines[0].endsWith(',Afiliado,Comisión')).toBe(true);
      expect(csv.text).toContain(`Stats Person (${a.code}),10.00`);
      expect(csv.text).toContain(',,0.00\r\n'); // an order without affiliate
    });

    test('GET /teacher/affiliates/:id/orders: only the orders attributed to it, same shape plus commission; only the owner', async () => {
      const res = await as(teacher).get(`/api/teacher/affiliates/${a.id}/orders?pageSize=100`);
      expect(res.status).toBe(200);
      const ids = res.body.rows.map(r => r.id);
      expect(ids).toEqual(expect.arrayContaining([seen.usd1.id, seen.usd2.id, seen.eur1.id, seen.free.id]));
      expect(ids).not.toContain(seen.other.id);
      expect(res.body.total).toBe(4);
      expect(res.body.rows.every(r => r.affiliate.id === a.id && 'commissionAmount' in r && 'commissionStatus' in r && 'buyer' in r)).toBe(true);
      expect((await as(teacher).get(`/api/teacher/affiliates/${a.id}/orders?status=refunded`)).body.rows.map(r => r.id)).toEqual([seen.usd2.id]);
      expect((await as(teacher).get(`/api/teacher/affiliates/${a.id}/orders?status=bogus`)).status).toBe(400);
      expect((await as(otherTeacher).get(`/api/teacher/affiliates/${a.id}/orders`)).status).toBe(403);
    });

    test('the public dashboard: own links, stats, orders and payouts, with NO buyer data; the free order is not listed', async () => {
      const fresh = (await own());
      const res = await as(null).get(`/api/public/affiliate-dashboard/${fresh.dashboardToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.affiliate).toEqual({ name: 'Stats Person', code: a.code, commissionPercent: 20 });
      expect(res.body.links).toEqual(expect.arrayContaining([
        { courseTitle: usd.title, url: `http://localhost:4200/courses/${usd.slug}?ref=${a.code}` },
        { courseTitle: eur.title, url: `http://localhost:4200/courses/${eur.slug}?ref=${a.code}` }
      ]));
      expect(res.body.links.some(l => l.url.includes(foreign.slug))).toBe(false); // another teacher's course
      expect(res.body.stats).toEqual(fresh.stats);
      expect(res.body.orders).toHaveLength(3);
      expect(res.body.orders.map(o => Object.keys(o).sort())).toEqual(Array(3).fill(['amount', 'commissionAmount', 'commissionStatus', 'courseTitle', 'currency', 'paidAt']));
      expect(res.body.orders.map(o => o.commissionStatus).sort()).toEqual(['pending', 'pending', 'void']);
      expect(res.body.payouts.every(p => Object.keys(p).sort().join() === 'amount,currency,note,paidAt')).toBe(true);

      const text = JSON.stringify(res.body);
      for (const secret of ['comprador-secreto@jest.test', '@jest.test', a.email, 'buyer-', 'fake-buyer']) expect(text).not.toContain(secret);
      const buyer = await User.findOne({ where: { email: 'comprador-secreto@jest.test' } });
      expect(text).not.toContain(buyer.name);
    });

    test('unknown, malformed, regenerated and inactive tokens are all the same 404', async () => {
      const b = await create();
      expect((await as(null).get(`/api/public/affiliate-dashboard/${b.dashboardToken}`)).status).toBe(200);
      for (const token of ['x', 'a'.repeat(43), 'a'.repeat(44), '../etc/passwd', '%00', affiliates.generateToken()]) {
        const res = await as(null).get(`/api/public/affiliate-dashboard/${encodeURIComponent(token)}`);
        expect([token, res.status, res.body]).toEqual([token, 404, { error: 'Dashboard not found' }]);
      }
      await as(teacher).put(`/api/teacher/affiliates/${b.id}`, { active: false });
      expect((await as(null).get(`/api/public/affiliate-dashboard/${b.dashboardToken}`)).status).toBe(404);
    });

    test('GET /public/affiliates/:code says only whether the code is valid', async () => {
      const b = await create();
      expect((await as(null).get(`/api/public/affiliates/${b.code}`)).body).toEqual({ valid: true });
      expect((await as(null).get(`/api/public/affiliates/${b.code.toLowerCase()}`)).body).toEqual({ valid: true });
      for (const code of ['NOPE-0000', 'x', '%20', 'a'.repeat(60)]) expect((await as(null).get(`/api/public/affiliates/${code}`)).body).toEqual({ valid: false });
      await as(teacher).put(`/api/teacher/affiliates/${b.id}`, { active: false });
      expect((await as(null).get(`/api/public/affiliates/${b.code}`)).body).toEqual({ valid: false });
    });
  });
});
