// Courses sold on Hotmart: course fields, "Buy now" to the Hotmart checkout and the purchase webhook (2.0.0).
const request = require('supertest');
const { randomUUID } = require('crypto');
const { Order, Enrollment, User, Coupon } = require('../src/models');
const { clearOutbox } = require('../src/services/mailService');
const { app, as, createWorld, createUser } = require('./helpers/fixtures');
const { publish, newCourse, mailsTo } = require('./helpers/sales');

const HOTTOK = 'hottok-jest-secret';
const CHECKOUT = 'https://pay.hotmart.com/Y106316284D';

const hook = (body, token = HOTTOK) => {
  const req = request(app).post('/api/payments/hotmart/webhook');
  return (token ? req.set('X-HOTMART-HOTTOK', token) : req).send(body);
};

const productId = () => String(Math.floor(Math.random() * 1e9));
const purchase = (event, { product, transaction, email, name = 'Jane Buyer', value = 19.99, currency = 'USD' }) => ({
  id: randomUUID(), creation_date: Date.now(), event, version: '2.0.0',
  data: {
    product: { id: Number(product), ucode: randomUUID(), name: 'Learn Spanish' },
    buyer: { email, name },
    purchase: { transaction, status: 'APPROVED', price: { value, currency_value: currency } }
  }
});

describe('selling on Hotmart', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });
  beforeEach(() => { process.env.HOTMART_HOTTOK = HOTTOK; clearOutbox(); });
  afterAll(() => { delete process.env.HOTMART_HOTTOK; });

  async function hotmartCourse() {
    const course = await publish(await newCourse(world.teacher));
    await course.update({ hotmartProductId: productId(), hotmartCheckoutUrl: CHECKOUT });
    return course;
  }

  describe('webhook', () => {
    test('rejects a wrong or missing hottok and answers 503 when the server has none', async () => {
      const body = purchase('PURCHASE_APPROVED', { product: '1', transaction: 'HP1', email: 'x@jest.test' });
      expect((await hook(body, 'wrong')).status).toBe(401);
      expect((await hook(body, null)).status).toBe(401);
      delete process.env.HOTMART_HOTTOK;
      expect((await hook(body)).status).toBe(503);
    });

    test('an approved purchase creates the account, the enrollment, a hotmart order and the email; replays do nothing', async () => {
      const course = await hotmartCourse();
      const email = `buyer-${randomUUID()}@jest.test`;
      const transaction = `HP${Date.now()}`;
      const body = purchase('PURCHASE_APPROVED', { product: course.hotmartProductId, transaction, email, value: 24.5, currency: 'EUR' });

      const res = await hook(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      const user = await User.findOne({ where: { email } });
      expect(user).toMatchObject({ role: 'student', name: 'Jane Buyer' });
      const order = await Order.findOne({ where: { providerSessionId: `hotmart_${transaction}` } });
      expect(order).toMatchObject({ provider: 'hotmart', status: 'paid', amount: 2450, currency: 'eur', userId: user.id, providerPaymentId: transaction });
      const enrollment = await Enrollment.findOne({ where: { studentId: user.id, courseId: course.id } });
      expect(enrollment).toMatchObject({ source: 'purchase', orderId: order.id });
      expect(mailsTo(email)).toHaveLength(1);
      expect(mailsTo(email)[0].text).toContain('Set your password');

      // Same delivery again, and the PURCHASE_COMPLETE that follows the approval: no new order, enrollment or email.
      expect((await hook(body)).status).toBe(200);
      expect((await hook({ ...body, event: 'PURCHASE_COMPLETE' })).status).toBe(200);
      expect(await Order.count({ where: { providerSessionId: `hotmart_${transaction}` } })).toBe(1);
      expect(await Enrollment.count({ where: { studentId: user.id, courseId: course.id } })).toBe(1);
      expect(mailsTo(email)).toHaveLength(1);
    });

    test('the product can also be matched by its ucode', async () => {
      const course = await publish(await newCourse(world.teacher));
      const ucode = randomUUID();
      await course.update({ hotmartProductId: ucode.slice(0, 36) });
      const email = `ucode-${randomUUID()}@jest.test`;
      const body = purchase('PURCHASE_APPROVED', { product: '999999', transaction: `HP-U${Date.now()}`, email });
      body.data.product.ucode = ucode;
      expect((await hook(body)).body).toEqual({ received: true });
      expect(await Enrollment.count({ where: { courseId: course.id } })).toBe(1);
    });

    test('unknown products, other events and bodies without a transaction are acknowledged and ignored', async () => {
      const course = await hotmartCourse();
      const email = `ignored-${randomUUID()}@jest.test`;
      for (const body of [
        purchase('PURCHASE_APPROVED', { product: '1', transaction: `HP-X${Date.now()}`, email }),
        purchase('PURCHASE_CANCELED', { product: course.hotmartProductId, transaction: `HP-C${Date.now()}`, email }),
        purchase('PURCHASE_APPROVED', { product: course.hotmartProductId, transaction: '', email }),
        { event: 'SUBSCRIPTION_CANCELLATION', data: {} }
      ]) {
        const res = await hook(body);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true, ignored: true });
      }
      expect(await User.count({ where: { email } })).toBe(0);
    });

    test.each(['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK'])('%s removes the access of that purchase', async event => {
      const course = await hotmartCourse();
      const email = `refund-${randomUUID()}@jest.test`;
      const transaction = `HP-R${Date.now()}${event.length}`;
      await hook(purchase('PURCHASE_APPROVED', { product: course.hotmartProductId, transaction, email }));
      const user = await User.findOne({ where: { email } });
      expect(await Enrollment.count({ where: { studentId: user.id, courseId: course.id } })).toBe(1);

      const res = await hook(purchase(event, { product: course.hotmartProductId, transaction, email }));
      expect(res.body).toEqual({ received: true });
      const order = await Order.findOne({ where: { providerSessionId: `hotmart_${transaction}` } });
      expect(order).toMatchObject({ status: 'refunded', refundedAmount: 1999 });
      expect(await Enrollment.count({ where: { studentId: user.id, courseId: course.id } })).toBe(0);
    });

    test('a refund that arrives before the approval keeps the late approval from giving access', async () => {
      const course = await hotmartCourse();
      const email = `early-${randomUUID()}@jest.test`;
      const transaction = `HP-E${Date.now()}`;
      await hook(purchase('PURCHASE_REFUNDED', { product: course.hotmartProductId, transaction, email }));
      await hook(purchase('PURCHASE_APPROVED', { product: course.hotmartProductId, transaction, email }));
      const order = await Order.findOne({ where: { providerSessionId: `hotmart_${transaction}` } });
      expect(order.status).toBe('refunded');
      expect(await Enrollment.count({ where: { courseId: course.id } })).toBe(0);
      expect(mailsTo(email)).toHaveLength(0);
    });
  });

  describe('checkout', () => {
    test('"Buy now" goes to the Hotmart checkout, with the logged-in student prefilled, and creates no order', async () => {
      const course = await hotmartCourse();
      const before = await Order.count({ where: { courseId: course.id } });
      const anonymous = await as(null).post('/api/checkout', { courseId: course.id });
      expect(anonymous.body).toEqual({ url: CHECKOUT });

      const student = await createUser('student', 'hotmart-buyer');
      const logged = await as(student).post('/api/checkout', { courseId: course.id });
      const url = new URL(logged.body.url);
      expect(url.origin + url.pathname).toBe(CHECKOUT);
      expect(url.searchParams.get('email')).toBe(student.email);
      expect(await Order.count({ where: { courseId: course.id } })).toBe(before);

      const page = await as(null).get(`/api/public/courses/${course.slug}`);
      expect(page.body.checkoutProvider).toBe('hotmart');
      expect(JSON.stringify(page.body)).not.toContain(course.hotmartProductId);
    });

    test('partial coupons are refused; a 100 % coupon still gives the course for free', async () => {
      const course = await hotmartCourse();
      const half = await Coupon.create({ teacherId: world.teacher.id, code: `HALF-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 50 });
      const free = await Coupon.create({ teacherId: world.teacher.id, code: `GIFT-${randomUUID().slice(0, 6).toUpperCase()}`, percentOff: 100 });

      for (const path of ['/api/checkout/quote', '/api/checkout']) {
        const res = await as(null).post(path, { courseId: course.id, couponCode: half.code });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('coupon_not_applicable');
      }
      expect((await as(null).post('/api/checkout/quote', { courseId: course.id, couponCode: free.code })).body.amount).toBe(0);
      const email = `gift-${randomUUID()}@jest.test`;
      const res = await as(null).post('/api/checkout', { courseId: course.id, couponCode: free.code, email });
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/\/checkout\/success\?session_id=coupon_/);
    });
  });

  describe('teacher', () => {
    test('validates the Hotmart fields of a course', async () => {
      const course = await newCourse(world.teacher);
      const put = body => as(world.teacher).put(`/api/courses/${course.id}`, { title: course.title, ...body });

      expect((await put({ hotmartCheckoutUrl: 'https://evil.example.com/pay' , hotmartProductId: '123' })).status).toBe(400);
      expect((await put({ hotmartCheckoutUrl: 'http://pay.hotmart.com/X' , hotmartProductId: '123' })).status).toBe(400);
      expect((await put({ hotmartCheckoutUrl: CHECKOUT })).status).toBe(400); // link without product
      expect((await put({ hotmartProductId: 'bad id!' })).status).toBe(400);

      const id = productId();
      const ok = await put({ hotmartProductId: id, hotmartCheckoutUrl: CHECKOUT });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ hotmartProductId: id, hotmartCheckoutUrl: CHECKOUT });

      const other = await newCourse(world.teacher);
      expect((await as(world.teacher).put(`/api/courses/${other.id}`, { title: other.title, hotmartProductId: id })).status).toBe(409);

      const cleared = await put({ hotmartProductId: '', hotmartCheckoutUrl: '' });
      expect(cleared.body).toMatchObject({ hotmartProductId: null, hotmartCheckoutUrl: null });
    });

    test('a Hotmart order is refunded in Hotmart unless marked manual; the setup endpoint gives the webhook URL', async () => {
      const course = await hotmartCourse();
      const transaction = `HP-M${Date.now()}`;
      await hook(purchase('PURCHASE_APPROVED', { product: course.hotmartProductId, transaction, email: `manual-${randomUUID()}@jest.test` }));
      const order = await Order.findOne({ where: { providerSessionId: `hotmart_${transaction}` } });

      const refused = await as(world.teacher).post(`/api/teacher/orders/${order.id}/refund`, {});
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('refund_in_hotmart');
      expect((await as(world.teacher).post(`/api/teacher/orders/${order.id}/refund`, { manual: true })).status).toBe(200);

      // El webhook y el token son de la cuenta única de Hotmart: un docente común no recibe la URL (ni en la respuesta).
      const setup = await as(world.teacher).get('/api/teacher/hotmart');
      expect(setup.status).toBe(200);
      expect(setup.body).toEqual({ canManage: false, configured: true });
      expect('webhookUrl' in setup.body).toBe(false);
      await world.teacher.update({ permissions: ['class_packages.manage_all'] });
      const managed = await as(world.teacher).get('/api/teacher/hotmart');
      expect(managed.body).toMatchObject({ canManage: true, configured: true });
      expect(managed.body.webhookUrl).toMatch(/\/api\/payments\/hotmart\/webhook$/);
      await world.teacher.update({ permissions: [] });
      expect((await as(world.student).get('/api/teacher/hotmart')).status).toBe(403);
    });
  });
});
