// Sales management: Stripe refunds (webhook), manual refunds, receipts, summary, order list, CSV, my orders, series offers.
const Stripe = require('stripe');
const request = require('supertest');
const { randomUUID } = require('crypto');
const { Order, Enrollment, User, Coupon, LessonProgress, Certificate } = require('../src/models');
const { fulfillOrder } = require('../src/services/orderService');
const { setStripeClient } = require('../src/services/paymentService');
const { csvCell } = require('../src/services/salesService');
const { app, as, createUser, createWorld } = require('./helpers/fixtures');
const { publish, newCourse } = require('./helpers/sales');

const daysAgo = days => new Date(Date.now() - days * 86400000);

describe('sales management', () => {
  let teacher; let otherTeacher; let course;
  beforeAll(async () => {
    [teacher, otherTeacher] = await Promise.all([createUser('teacher', 'sales-owner'), createUser('teacher', 'sales-other')]);
    course = await publish(await newCourse(teacher), { price: 5000, currency: 'usd' });
  });
  afterEach(() => { setStripeClient(null); delete process.env.STRIPE_SECRET_KEY; });

  const deliver = payload => {
    const body = JSON.stringify(payload);
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET });
    return request(app).post('/api/payments/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(body);
  };
  const completedEvent = (order, intent, email) => ({ id: `evt_${randomUUID()}`, type: 'checkout.session.completed',
    data: { object: { id: order.providerSessionId, payment_status: 'paid', amount_total: order.amount, payment_intent: intent, customer_details: { email, name: 'Buyer' } } } });
  const refundEvent = (intent, refunded, { total = false, amount = 5000 } = {}) => ({ id: `evt_${randomUUID()}`, type: 'charge.refunded',
    data: { object: { id: `ch_${randomUUID()}`, payment_intent: intent, amount, amount_refunded: refunded, refunded: total } } });

  /** A paid Stripe order (through the webhook) with its enrollment. */
  async function paidStripeOrder(values = {}) {
    const target = values.course || course;
    const order = await Order.create({ courseId: target.id, amount: values.amount ?? target.price, originalAmount: values.amount ?? target.price, currency: target.currency, provider: 'stripe', providerSessionId: `cs_test_${randomUUID()}` });
    const intent = `pi_${randomUUID()}`;
    const email = `buyer-${randomUUID()}@jest.test`;
    expect((await deliver(completedEvent(order, intent, email))).status).toBe(200);
    const user = await User.findOne({ where: { email } });
    return { order: await Order.findByPk(order.id), intent, user, email };
  }
  const hasAccess = (user, target = course) => Enrollment.findOne({ where: { studentId: user.id, courseId: target.id } });

  describe('Stripe webhook charge.refunded', () => {
    test('a total refund marks the order refunded and removes the access of that purchase (with progress and certificate)', async () => {
      const { order, intent, user } = await paidStripeOrder();
      const enrollment = await hasAccess(user);
      expect(enrollment).toMatchObject({ source: 'purchase', orderId: order.id });
      await Certificate.create({ enrollmentId: enrollment.id, code: randomUUID().slice(0, 14), studentName: 'x', courseTitle: 'y', teacherName: 'z', issuedAt: new Date() });

      const res = await deliver(refundEvent(intent, 5000, { total: true }));
      expect(res.status).toBe(200);
      expect(res.body.ignored).toBeUndefined();
      const refunded = await Order.findByPk(order.id);
      expect(refunded).toMatchObject({ status: 'refunded', refundedAmount: 5000 });
      expect(refunded.refundedAt).toBeInstanceOf(Date);
      expect(await hasAccess(user)).toBeNull();
      expect(await Certificate.count({ where: { enrollmentId: enrollment.id } })).toBe(0);
      expect(await LessonProgress.count({ where: { enrollmentId: enrollment.id } })).toBe(0);
    });

    test('replaying the same total refund changes nothing; the purchase event replayed afterwards does not give access back', async () => {
      const { order, intent, user, email } = await paidStripeOrder();
      const event = refundEvent(intent, 5000, { total: true });
      await deliver(event);
      const first = await Order.findByPk(order.id);
      expect((await deliver(event)).status).toBe(200);
      const second = await Order.findByPk(order.id);
      expect(second.refundedAt.getTime()).toBe(first.refundedAt.getTime());
      expect(second.refundedAmount).toBe(5000);

      expect((await deliver(completedEvent(order, intent, email))).status).toBe(200);
      expect((await Order.findByPk(order.id)).status).toBe('refunded');
      expect(await hasAccess(user)).toBeNull();
    });

    test('a partial refund records the amount only: status paid, access kept; replays and older events do not change it', async () => {
      const { order, intent, user } = await paidStripeOrder();
      await deliver(refundEvent(intent, 1000));
      expect(await Order.findByPk(order.id)).toMatchObject({ status: 'paid', refundedAmount: 1000 });
      expect(await hasAccess(user)).not.toBeNull();

      await deliver(refundEvent(intent, 1000)); // replay: cumulative, not summed
      expect((await Order.findByPk(order.id)).refundedAmount).toBe(1000);
      await deliver(refundEvent(intent, 2500));
      expect((await Order.findByPk(order.id)).refundedAmount).toBe(2500);
      await deliver(refundEvent(intent, 1000)); // delivered late
      expect((await Order.findByPk(order.id)).refundedAmount).toBe(2500);
      expect(await hasAccess(user)).not.toBeNull();
    });

    test('partial refunds that add up to the whole become a total refund (by amount, even without the refunded flag)', async () => {
      const { order, intent, user } = await paidStripeOrder();
      await deliver(refundEvent(intent, 2000));
      await deliver(refundEvent(intent, 5000));
      expect(await Order.findByPk(order.id)).toMatchObject({ status: 'refunded', refundedAmount: 5000 });
      expect(await hasAccess(user)).toBeNull();
    });

    test('an amount above the order is capped; an unknown charge is ignored', async () => {
      const { order, intent } = await paidStripeOrder();
      await deliver(refundEvent(intent, 99999, { total: true }));
      expect((await Order.findByPk(order.id)).refundedAmount).toBe(5000);
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const res = await deliver(refundEvent(`pi_${randomUUID()}`, 100));
      spy.mockRestore();
      expect(res.status).toBe(200);
      expect(res.body.ignored).toBe(true);
    });

    test('only the enrolment created by that purchase is removed, never one from another source', async () => {
      const student = await createUser('student', 'refund-manual');
      const manual = await Enrollment.create({ studentId: student.id, courseId: course.id, source: 'manual' });
      const order = await Order.create({ courseId: course.id, amount: 5000, currency: 'usd', provider: 'stripe', providerSessionId: `cs_${randomUUID()}` });
      await fulfillOrder(order, { email: student.email, paymentId: 'pi_manual_case' });
      expect((await Enrollment.findByPk(manual.id)).source).toBe('manual');

      await deliver(refundEvent('pi_manual_case', 5000, { total: true }));
      expect((await Order.findByPk(order.id)).status).toBe('refunded');
      expect(await Enrollment.findByPk(manual.id)).not.toBeNull();
    });

    test('a refund of one buyer does not touch another buyer of the same course', async () => {
      const a = await paidStripeOrder();
      const b = await paidStripeOrder();
      await deliver(refundEvent(a.intent, 5000, { total: true }));
      expect(await hasAccess(a.user)).toBeNull();
      expect(await hasAccess(b.user)).not.toBeNull();
      expect((await Order.findByPk(b.order.id)).status).toBe('paid');
    });
  });

  describe('receipt', () => {
    test('the Stripe receipt link is stored when the order is paid', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_jest';
      const retrieve = jest.fn().mockResolvedValue({ latest_charge: { receipt_url: 'https://pay.stripe.com/receipts/abc' } });
      setStripeClient({ paymentIntents: { retrieve } });
      const { order } = await paidStripeOrder();
      expect(retrieve).toHaveBeenCalledWith(expect.stringMatching(/^pi_/), { expand: ['latest_charge'] });
      expect(order.receiptUrl).toBe('https://pay.stripe.com/receipts/abc');
    });

    test('if Stripe cannot be reached for the receipt, the order is paid anyway with no link', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_jest';
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      setStripeClient({ paymentIntents: { retrieve: jest.fn().mockRejectedValue(new Error('network')) } });
      const { order } = await paidStripeOrder();
      spy.mockRestore();
      expect(order).toMatchObject({ status: 'paid', receiptUrl: null });
    });

    test('without Stripe keys (fake mode) the receipt stays null', async () => {
      const { order } = await paidStripeOrder();
      expect(order.receiptUrl).toBeNull();
    });
  });

  describe('manual refund', () => {
    let world;
    beforeAll(async () => { world = await createWorld(); });
    async function fakeOrder(target, values = {}) {
      const order = await Order.create({ courseId: target.id, amount: 5000, originalAmount: 5000, currency: 'usd', provider: 'fake', providerSessionId: `fake_${randomUUID()}`, ...values });
      const email = `man-${randomUUID()}@jest.test`;
      await fulfillOrder(order, { email });
      return { order: await Order.findByPk(order.id), user: await User.findOne({ where: { email } }) };
    }

    test('refunds a fake order: status, amount, date and access of that purchase', async () => {
      const { order, user } = await fakeOrder(course);
      const res = await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: order.id, status: 'refunded', refundedAmount: 5000, course: { id: course.id }, buyer: { email: user.email }, accessRevoked: true });
      expect(await hasAccess(user)).toBeNull();
      expect((await Order.findByPk(order.id)).refundedAt).toBeInstanceOf(Date);
    });

    test('revokeAccess false keeps the student enrolled', async () => {
      const { order, user } = await fakeOrder(course);
      const res = await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, { revokeAccess: false });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'refunded', accessRevoked: false });
      expect(await hasAccess(user)).not.toBeNull();
    });

    test('a Stripe order is refused (409) unless manual is explicit', async () => {
      const { order, user } = await paidStripeOrder();
      const refused = await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect(refused.status).toBe(409);
      expect(refused.body.error).toMatch(/Stripe/);
      expect((await Order.findByPk(order.id)).status).toBe('paid');
      const done = await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, { manual: true, revokeAccess: true });
      expect(done.status).toBe(200);
      expect(await hasAccess(user)).toBeNull();
    });

    test('a refunded, pending or foreign order cannot be refunded; students are denied; unknown is 404', async () => {
      const { order } = await fakeOrder(course);
      await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect((await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {})).status).toBe(409);

      const pending = await Order.create({ courseId: course.id, amount: 5000, currency: 'usd', provider: 'fake', providerSessionId: `fake_${randomUUID()}` });
      expect((await as(teacher).post(`/api/teacher/orders/${pending.id}/refund`, {})).status).toBe(409);

      const { order: other } = await fakeOrder(course);
      expect((await as(otherTeacher).post(`/api/teacher/orders/${other.id}/refund`, {})).status).toBe(403);
      expect((await as(world.student).post(`/api/teacher/orders/${other.id}/refund`, {})).status).toBe(403);
      expect((await as(null).post(`/api/teacher/orders/${other.id}/refund`, {})).status).toBe(401);
      expect((await as(teacher).post('/api/teacher/orders/2147483646/refund', {})).status).toBe(404);
      expect((await as(teacher).post(`/api/teacher/orders/${other.id}/refund`, { revokeAccess: 'maybe' })).status).toBe(400);
      expect((await Order.findByPk(other.id)).status).toBe('paid');
    });

    test('a free (coupon) order can be marked refunded and revokes its access', async () => {
      const coupon = await Coupon.create({ teacherId: teacher.id, code: `G-${randomUUID().slice(0, 8).toUpperCase()}`, percentOff: 100 });
      const email = `gift-${randomUUID()}@jest.test`;
      const order = await Order.create({ courseId: course.id, amount: 0, originalAmount: 5000, discountAmount: 5000, currency: 'usd', provider: 'coupon', providerSessionId: `coupon_${randomUUID()}`, couponId: coupon.id });
      await fulfillOrder(order, { email });
      const res = await as(teacher).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'refunded', refundedAmount: 0, amount: 0 });
      expect(await hasAccess(await User.findOne({ where: { email } }))).toBeNull();
    });
  });

  describe('summary', () => {
    let seller; let usdCourse; let eurCourse; let otherSellerCourse;
    beforeAll(async () => {
      seller = await createUser('teacher', 'summary-owner');
      usdCourse = await publish(await newCourse(seller, { title: 'Curso USD' }), { price: 10000, currency: 'usd' });
      eurCourse = await publish(await newCourse(seller, { title: 'Curso EUR' }), { price: 4000, currency: 'eur' });
      otherSellerCourse = await publish(await newCourse(otherTeacher), { price: 99999, currency: 'usd' });
      const make = (target, values) => Order.create({ courseId: target.id, currency: target.currency, provider: 'stripe', providerSessionId: `cs_${randomUUID()}`, email: 'b@jest.test', ...values });
      await make(usdCourse, { amount: 10000, status: 'paid', paidAt: daysAgo(5) });
      await make(usdCourse, { amount: 8000, status: 'paid', paidAt: daysAgo(40), refundedAmount: 3000 }); // partial
      await make(usdCourse, { amount: 10000, status: 'refunded', paidAt: daysAgo(70), refundedAmount: 10000 });
      await make(eurCourse, { amount: 4000, status: 'paid', paidAt: daysAgo(5) });
      await make(usdCourse, { amount: 10000, status: 'pending' });
      await make(usdCourse, { amount: 10000, status: 'failed' });
      await make(usdCourse, { amount: 10000, status: 'paid', paidAt: daysAgo(900) }); // outside the default 12 months
      await make(otherSellerCourse, { amount: 99999, status: 'paid', paidAt: daysAgo(5) });
    });

    test('groups money by currency (never mixed), skips pending/failed and other teachers, and defaults to 12 months', async () => {
      const res = await as(seller).get('/api/teacher/sales/summary');
      expect(res.status).toBe(200);
      expect(res.body.totals).toEqual([
        { currency: 'eur', gross: 4000, refunds: 0, net: 4000, orders: 1, refundsCount: 0 },
        { currency: 'usd', gross: 28000, refunds: 13000, net: 15000, orders: 3, refundsCount: 2 }
      ]);
      const usdMonths = res.body.byMonth.filter(m => m.currency === 'usd');
      expect(usdMonths.reduce((sum, m) => sum + m.net, 0)).toBe(15000);
      expect(usdMonths.reduce((sum, m) => sum + m.orders, 0)).toBe(3);
      expect(res.body.byMonth.every(m => /^\d{4}-\d{2}$/.test(m.month))).toBe(true);
      expect(res.body.byMonth.map(m => m.month)).toEqual([...res.body.byMonth.map(m => m.month)].sort());
      expect(res.body.byCourse).toEqual([
        { courseId: usdCourse.id, title: 'Curso USD', currency: 'usd', net: 15000, orders: 3 },
        { courseId: eurCourse.id, title: 'Curso EUR', currency: 'eur', net: 4000, orders: 1 }
      ]);
    });

    test('from and to narrow the period; bad dates are 400; no sales is an empty summary', async () => {
      const day = date => date.toISOString().slice(0, 10);
      const wide = await as(seller).get(`/api/teacher/sales/summary?from=2000-01-01&to=${day(new Date())}`);
      expect(wide.body.totals.find(t => t.currency === 'usd')).toMatchObject({ gross: 38000, orders: 4 }); // includes the 900-day-old order
      const narrow = await as(seller).get(`/api/teacher/sales/summary?from=${day(daysAgo(10))}&to=${day(new Date())}`);
      expect(narrow.body.totals).toEqual([
        { currency: 'eur', gross: 4000, refunds: 0, net: 4000, orders: 1, refundsCount: 0 },
        { currency: 'usd', gross: 10000, refunds: 0, net: 10000, orders: 1, refundsCount: 0 }
      ]);
      expect((await as(seller).get('/api/teacher/sales/summary?from=nonsense')).status).toBe(400);
      expect((await as(seller).get('/api/teacher/sales/summary?from=2026-05-01&to=2026-04-01')).status).toBe(400);
      expect((await as(await createUser('teacher', 'summary-empty')).get('/api/teacher/sales/summary')).body).toEqual({ totals: [], byMonth: [], byCourse: [] });
    });

    test('a manual refund moves the order out of net revenue', async () => {
      const t = await createUser('teacher', 'summary-refund');
      const c = await publish(await newCourse(t), { price: 2000, currency: 'usd' });
      const order = await Order.create({ courseId: c.id, amount: 2000, currency: 'usd', provider: 'fake', providerSessionId: `fake_${randomUUID()}` });
      await fulfillOrder(order, { email: `s-${randomUUID()}@jest.test` });
      expect((await as(t).get('/api/teacher/sales/summary')).body.totals[0]).toMatchObject({ gross: 2000, refunds: 0, net: 2000 });
      await as(t).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect((await as(t).get('/api/teacher/sales/summary')).body.totals[0]).toMatchObject({ gross: 2000, refunds: 2000, net: 0, orders: 1, refundsCount: 1 });
    });

    test('requires a teacher', async () => {
      expect((await as(null).get('/api/teacher/sales/summary')).status).toBe(401);
      expect((await as(await createUser('student', 'summary-student')).get('/api/teacher/sales/summary')).status).toBe(403);
    });
  });

  describe('order list and CSV', () => {
    let seller; let c1; let c2; let buyerA; let buyerB;
    beforeAll(async () => {
      seller = await createUser('teacher', 'list-owner');
      c1 = await publish(await newCourse(seller, { title: '=cmd|calc Español' }), { price: 3000, currency: 'usd' });
      c2 = await publish(await newCourse(seller, { title: 'Curso "con comillas", y coma' }), { price: 1500, currency: 'usd' });
      const foreign = await publish(await newCourse(otherTeacher), { price: 3000, currency: 'usd' });
      buyerA = await User.create({ name: '=HYPERLINK("http://evil","x")', email: `ana-${randomUUID().slice(0, 6)}@jest.test`, password: 'pw-jest-1234', role: 'student' });
      buyerB = await User.create({ name: 'Beto\nSalto', email: `beto-${randomUUID().slice(0, 6)}@jest.test`, password: 'pw-jest-1234', role: 'student' });
      const coupon = await Coupon.create({ teacherId: seller.id, code: `LIST-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 20 });
      const make = values => Order.create({ currency: 'usd', provider: 'stripe', providerSessionId: `cs_${randomUUID()}`, ...values });
      await make({ courseId: c1.id, userId: buyerA.id, email: buyerA.email, amount: 2400, originalAmount: 3000, discountAmount: 600, couponId: coupon.id, status: 'paid', paidAt: daysAgo(3), receiptUrl: 'https://pay.stripe.com/receipts/r1' });
      await make({ courseId: c2.id, userId: buyerB.id, email: buyerB.email, amount: 1500, originalAmount: 1500, status: 'refunded', refundedAmount: 1500, paidAt: daysAgo(2) });
      await make({ courseId: c2.id, userId: buyerA.id, email: buyerA.email, amount: 1500, status: 'paid', refundedAmount: 500, paidAt: daysAgo(1) }); // partial, legacy: no originalAmount
      await make({ courseId: c1.id, email: 'anon@jest.test', amount: 3000, status: 'pending' });
      await make({ courseId: foreign.id, userId: buyerA.id, email: buyerA.email, amount: 3000, status: 'paid', paidAt: daysAgo(1) });
    });

    test('lists the teacher\'s paid and refunded orders, newest first, in the documented shape', async () => {
      const res = await as(seller).get('/api/teacher/orders');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.rows.map(r => r.status)).toEqual(['paid', 'refunded', 'paid']);
      expect(res.body.rows[2]).toEqual({
        id: expect.any(Number), createdAt: expect.any(String), paidAt: expect.any(String), course: { id: c1.id, title: c1.title },
        buyer: { id: buyerA.id, name: buyerA.name, email: buyerA.email }, amount: 2400, originalAmount: 3000, discountAmount: 600, currency: 'usd',
        status: 'paid', refundedAmount: 0, coupon: { code: expect.stringMatching(/^LIST-/) }, provider: 'stripe', receiptUrl: 'https://pay.stripe.com/receipts/r1',
        affiliate: null, commissionAmount: 0, commissionStatus: 'none'
      });
      expect(res.body.rows[0]).toMatchObject({ amount: 1500, originalAmount: 1500, discountAmount: 0, refundedAmount: 500, coupon: null, receiptUrl: null });
    });

    test('filters by status (including partial), course and search (email or name, LIKE characters are literal)', async () => {
      const get = query => as(seller).get(`/api/teacher/orders?${query}`);
      expect((await get('status=refunded')).body.total).toBe(1);
      expect((await get('status=paid')).body.total).toBe(2);
      expect((await get('status=partially_refunded')).body.total).toBe(1);
      expect((await get('status=pending')).body.total).toBe(1);
      expect((await get('status=bogus')).status).toBe(400);
      expect((await get(`courseId=${c2.id}`)).body.total).toBe(2);
      expect((await get('courseId=abc')).status).toBe(400);
      expect((await get(`q=${encodeURIComponent(buyerA.email.slice(0, 8))}`)).body.total).toBe(2);
      expect((await get('q=beto')).body.total).toBe(1);
      expect((await get('q=%25')).body.total).toBe(0);
      expect((await get(`status=paid&courseId=${c2.id}&q=ana`)).body.total).toBe(1);
    });

    test('paginates with a maximum page size of 100 and reports the total', async () => {
      const page1 = await as(seller).get('/api/teacher/orders?page=1&pageSize=2');
      const page2 = await as(seller).get('/api/teacher/orders?page=2&pageSize=2');
      expect(page1.body.total).toBe(3);
      expect(page1.body.rows).toHaveLength(2);
      expect(page2.body.rows).toHaveLength(1);
      expect(new Set([...page1.body.rows, ...page2.body.rows].map(r => r.id)).size).toBe(3);
      expect((await as(seller).get('/api/teacher/orders?pageSize=100000')).status).toBe(200);
    });

    test('a teacher never sees another teacher\'s orders; anonymous and students are denied', async () => {
      expect((await as(otherTeacher).get('/api/teacher/orders?status=paid')).body.rows.every(r => r.buyer.id !== buyerB.id)).toBe(true);
      expect((await as(await createUser('teacher', 'list-nobody')).get('/api/teacher/orders')).body).toEqual({ rows: [], total: 0 });
      expect((await as(null).get('/api/teacher/orders')).status).toBe(401);
      expect((await as(await createUser('student', 'list-student')).get('/api/teacher/orders')).status).toBe(403);
    });

    test('csvCell escapes quotes, commas and line breaks and neutralizes formulas', () => {
      expect(csvCell('plain')).toBe('plain');
      expect(csvCell('a,b')).toBe('"a,b"');
      expect(csvCell('say "hi"')).toBe('"say ""hi"""');
      expect(csvCell('two\nlines')).toBe('"two\nlines"');
      expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
      expect(csvCell('+1')).toBe("'+1");
      expect(csvCell('-1')).toBe("'-1");
      expect(csvCell('@cmd')).toBe("'@cmd");
      expect(csvCell("=1,2")).toBe('"\'=1,2"');
      expect(csvCell(null)).toBe('');
      expect(csvCell(0)).toBe('0');
    });

    test('exports the same filters as a Spanish CSV with BOM, proper escaping and no formula injection', async () => {
      const res = await as(seller).get('/api/teacher/orders/export.csv?status=paid');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="ventas-\d{4}-\d{2}-\d{2}\.csv"/);
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xFEFF);
      const lines = text.slice(1).split('\r\n');
      expect(lines[0]).toBe('ID,Fecha,Fecha de pago,Curso,Comprador,Email,Monto original,Descuento,Monto pagado,Moneda,Estado,Reembolsado,Cupón,Medio de pago,Recibo,Afiliado,Comisión');
      expect(lines.filter(Boolean)).toHaveLength(3); // header + 2 paid orders
      expect(text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`); // buyer name: formula neutralized, quotes doubled
      expect(text).toContain("'=cmd|calc"); // course title
      expect(text).toContain('"Curso ""con comillas"", y coma"');
      expect(text).toContain(',30.00,6.00,24.00,USD,Pagada,0.00,');
      expect(text).toContain(',15.00,0.00,15.00,USD,Reembolso parcial,5.00,');
      expect(text).not.toContain('Reembolsada');
    });

    test('the CSV includes a multi-line name inside quotes, honours filters and is denied to anonymous callers', async () => {
      const res = await as(seller).get('/api/teacher/orders/export.csv?status=refunded');
      expect(res.text).toContain('"Beto\nSalto"');
      expect(res.text).toContain('Reembolsada');
      expect((await as(seller).get('/api/teacher/orders/export.csv?status=bogus')).status).toBe(400);
      expect((await as(null).get('/api/teacher/orders/export.csv')).status).toBe(401);
      const empty = await as(await createUser('teacher', 'csv-empty')).get('/api/teacher/orders/export.csv');
      expect(empty.status).toBe(200);
      expect(empty.text.slice(1).split('\r\n').filter(Boolean)).toHaveLength(1);
    });
  });

  describe('GET /api/me/orders', () => {
    test('returns the student\'s paid and refunded orders only', async () => {
      const student = await createUser('student', 'me-orders');
      const make = values => Order.create({ courseId: course.id, userId: student.id, email: student.email, currency: 'usd', provider: 'stripe', providerSessionId: `cs_${randomUUID()}`, ...values });
      await make({ amount: 5000, status: 'paid', paidAt: daysAgo(3), receiptUrl: 'https://pay.stripe.com/receipts/m1' });
      await make({ amount: 4000, status: 'refunded', refundedAmount: 4000, paidAt: daysAgo(1) });
      await make({ amount: 5000, status: 'pending' });
      await Order.create({ courseId: course.id, userId: (await createUser('student', 'me-other')).id, amount: 5000, currency: 'usd', status: 'paid', paidAt: new Date(), provider: 'stripe', providerSessionId: `cs_${randomUUID()}` });

      const res = await as(student).get('/api/me/orders');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: expect.any(Number), paidAt: expect.any(String), course: { title: course.title, slug: course.slug }, amount: 4000, currency: 'usd', status: 'refunded', refundedAmount: 4000, receiptUrl: null },
        { id: expect.any(Number), paidAt: expect.any(String), course: { title: course.title, slug: course.slug }, amount: 5000, currency: 'usd', status: 'paid', refundedAmount: 0, receiptUrl: 'https://pay.stripe.com/receipts/m1' }
      ]);
      expect((await as(null).get('/api/me/orders')).status).toBe(401);
      expect((await as(await createUser('student', 'me-none')).get('/api/me/orders')).body).toEqual([]);
    });
  });

  describe('series', () => {
    let first; let second; let student; let enrollment; let offer;
    beforeAll(async () => {
      first = await publish(await newCourse(teacher), { price: 3000, currency: 'usd' });
      second = await publish(await newCourse(teacher), { price: 6000, currency: 'usd' });
      offer = await Coupon.create({ teacherId: teacher.id, code: `SER-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 30, courseId: second.id });
      await first.update({ nextCourseId: second.id, nextCourseCouponId: offer.id });
      student = await createUser('student', 'series');
      enrollment = await Enrollment.create({ studentId: student.id, courseId: first.id });
    });

    test('the public page of both courses links to each other', async () => {
      const a = await as(null).get(`/api/public/courses/${first.slug}`);
      expect(a.body.series).toEqual({ previous: null, next: { slug: second.slug, title: second.title } });
      const b = await as(null).get(`/api/public/courses/${second.slug}`);
      expect(b.body.series).toEqual({ previous: { slug: first.slug, title: first.title }, next: null });
    });

    test('an unpublished neighbour is not shown', async () => {
      const hidden = await newCourse(teacher);
      const lone = await publish(await newCourse(teacher));
      await lone.update({ nextCourseId: hidden.id });
      expect((await as(null).get(`/api/public/courses/${lone.slug}`)).body.series).toEqual({ previous: null, next: null });
    });

    test('progress offers the next course with the coupon that works, and no offer when there is no next course', async () => {
      const res = await as(student).get(`/api/enrollments/${enrollment.id}/progress`);
      expect(res.status).toBe(200);
      expect(res.body.next).toEqual({
        course: { id: second.id, slug: second.slug, title: second.title, price: 6000, currency: 'usd' }, couponCode: offer.code, alreadyEnrolled: false
      });
      const plain = await Enrollment.create({ studentId: student.id, courseId: second.id });
      expect((await as(student).get(`/api/enrollments/${plain.id}/progress`)).body.next).toBeNull();
      await plain.destroy();
    });

    test('couponCode is null when the coupon is no longer usable; alreadyEnrolled once they own the next course', async () => {
      await offer.update({ expiresAt: new Date(Date.now() - 1000) });
      expect((await as(student).get(`/api/enrollments/${enrollment.id}/progress`)).body.next.couponCode).toBeNull();
      await offer.update({ expiresAt: null });
      expect((await as(student).get(`/api/enrollments/${enrollment.id}/progress`)).body.next.couponCode).toBe(offer.code);

      const owned = await Enrollment.create({ studentId: student.id, courseId: second.id });
      expect((await as(student).get(`/api/enrollments/${enrollment.id}/progress`)).body.next).toMatchObject({ alreadyEnrolled: true, couponCode: null });
      await owned.destroy();
    });

    test('an unpublished next course gives no offer', async () => {
      await second.update({ isPublished: false });
      expect((await as(student).get(`/api/enrollments/${enrollment.id}/progress`)).body.next).toBeNull();
      await second.update({ isPublished: true });
    });
  });
});
