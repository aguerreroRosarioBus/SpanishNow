// Coupons: price calculation, teacher CRUD, quote, checkout (fake, 100 % and Stripe), redemptions and course series fields.
const { randomUUID } = require('crypto');
const { Order, Enrollment, User, Coupon, Course } = require('../src/models');
const { discountFor, applyToCourse, CouponError } = require('../src/services/couponService');
const { fulfillOrder } = require('../src/services/orderService');
const { setStripeClient } = require('../src/services/paymentService');
const { clearOutbox } = require('../src/services/mailService');
const { as, createUser } = require('./helpers/fixtures');
const { publish, newCourse, mailsTo } = require('./helpers/sales');

const code = prefix => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
const makeCoupon = (teacher, values = {}) => Coupon.create({ teacherId: teacher.id, code: code('T'), percentOff: 10, ...values });
const sessionIdOf = url => new URL(url).searchParams.get('session_id');

describe('coupons', () => {
  let teacher; let otherTeacher; let course; let eurCourse; let foreignCourse;
  beforeAll(async () => {
    [teacher, otherTeacher] = await Promise.all([createUser('teacher', 'coupon-owner'), createUser('teacher', 'coupon-other')]);
    course = await publish(await newCourse(teacher), { price: 10000, currency: 'usd' });
    eurCourse = await publish(await newCourse(teacher), { price: 5000, currency: 'eur' });
    foreignCourse = await publish(await newCourse(otherTeacher), { price: 10000, currency: 'usd' });
  });
  beforeEach(() => { process.env.PAYMENTS_FAKE = '1'; clearOutbox(); });
  afterEach(() => { process.env.PAYMENTS_FAKE = '0'; });

  describe('price calculation', () => {
    test('a percentage rounds the discount down, in whole cents', () => {
      expect(discountFor({ percentOff: 15 }, 1999)).toBe(299); // 299.85
      expect(discountFor({ percentOff: 33 }, 1)).toBe(0);
      expect(discountFor({ percentOff: 50 }, 1999)).toBe(999);
      expect(discountFor({ percentOff: 100 }, 1999)).toBe(1999);
      expect(discountFor({ percentOff: 100 }, 99999999)).toBe(99999999);
    });

    test('a fixed amount never exceeds the price: the final amount is never negative', () => {
      expect(discountFor({ amountOff: 500 }, 1999)).toBe(500);
      expect(discountFor({ amountOff: 5000 }, 1999)).toBe(1999);
      const course = { id: 1, teacherId: 1, price: 1999, currency: 'USD' };
      const base = { active: true, teacherId: 1, courseId: null, redemptions: 0, maxRedemptions: null, expiresAt: null };
      expect(applyToCourse({ ...base, amountOff: 5000, currency: 'usd' }, course)).toMatchObject({ discountAmount: 1999, amount: 0 });
    });

    test('a final price between 1 and 49 cents is refused (Stripe minimum), 0 and 50 are fine', () => {
      const course = { id: 1, teacherId: 1, price: 1000, currency: 'usd' };
      const base = { active: true, teacherId: 1, courseId: null, redemptions: 0, maxRedemptions: null, expiresAt: null, currency: 'usd' };
      expect(() => applyToCourse({ ...base, amountOff: 960 }, course)).toThrow(CouponError); // 40 left
      expect(applyToCourse({ ...base, amountOff: 950 }, course).amount).toBe(50);
      expect(applyToCourse({ ...base, amountOff: 1000 }, course).amount).toBe(0);
    });
  });

  describe('teacher API', () => {
    test('only a teacher, and only with a token', async () => {
      expect((await as(null).get('/api/teacher/coupons')).status).toBe(401);
      expect((await as(await createUser('student', 'coupon-student')).get('/api/teacher/coupons')).status).toBe(403);
    });

    test('creates a coupon with the code in uppercase and lists only the teacher\'s own', async () => {
      const mine = code('mine').toLowerCase();
      const res = await as(teacher).post('/api/teacher/coupons', { code: ` ${mine} `, percentOff: 20, courseId: course.id, maxRedemptions: 5, expiresAt: '2099-12-31' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ code: mine.toUpperCase(), percentOff: 20, amountOff: null, currency: null, courseId: course.id, course: { id: course.id, title: course.title }, maxRedemptions: 5, redemptions: 0, active: true });
      expect(res.body.expiresAt).toBe('2099-12-31T23:59:59.999Z');

      const theirs = await makeCoupon(otherTeacher);
      const list = await as(teacher).get('/api/teacher/coupons');
      expect(list.status).toBe(200);
      const codes = list.body.map(c => c.code);
      expect(codes).toContain(mine.toUpperCase());
      expect(codes).not.toContain(theirs.code);
      expect((await as(otherTeacher).get('/api/teacher/coupons')).body.map(c => c.code)).not.toContain(mine.toUpperCase());
    });

    test.each([
      ['no discount', { code: 'NODISC1' }],
      ['both discounts', { code: 'BOTH1', percentOff: 10, amountOff: 100, currency: 'usd' }],
      ['percent 0', { code: 'ZERO1', percentOff: 0 }],
      ['percent 101', { code: 'OVER1', percentOff: 101 }],
      ['percent 10.5', { code: 'FRAC1', percentOff: 10.5 }],
      ['amount without currency', { code: 'NOCUR1', amountOff: 500 }],
      ['amount 0', { code: 'AMT01', amountOff: 0, currency: 'usd' }],
      ['bad code characters', { code: 'bad code!', percentOff: 10 }],
      ['code too short', { code: 'AB', percentOff: 10 }],
      ['no code', { percentOff: 10 }],
      ['maxRedemptions 0', { code: 'MAX01', percentOff: 10, maxRedemptions: 0 }],
      ['invalid date', { code: 'DATE1', percentOff: 10, expiresAt: 'tomorrow-ish' }]
    ])('rejects %s', async (_label, body) => {
      const res = await as(teacher).post('/api/teacher/coupons', body);
      expect(res.status).toBe(400);
    });

    test('a coupon for another teacher\'s course, or an amount in another currency than its course, is rejected; duplicate code is 409', async () => {
      expect((await as(teacher).post('/api/teacher/coupons', { code: code('F'), percentOff: 10, courseId: foreignCourse.id })).status).toBe(400);
      expect((await as(teacher).post('/api/teacher/coupons', { code: code('E'), amountOff: 500, currency: 'usd', courseId: eurCourse.id })).status).toBe(400);
      const ok = await as(teacher).post('/api/teacher/coupons', { code: code('E'), amountOff: 500, currency: 'EUR', courseId: eurCourse.id });
      expect(ok.status).toBe(201);
      expect(ok.body.currency).toBe('eur');
      const dup = await as(otherTeacher).post('/api/teacher/coupons', { code: ok.body.code, percentOff: 5 });
      expect(dup.status).toBe(409);
    });

    test('update: free fields while unused; a used coupon only changes active, expiresAt and maxRedemptions', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 10 });
      let res = await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { percentOff: 30, maxRedemptions: 3 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ percentOff: 30, maxRedemptions: 3 });
      res = await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { amountOff: 700, currency: 'usd' });
      expect(res.body).toMatchObject({ percentOff: null, amountOff: 700, currency: 'usd' });

      await coupon.update({ redemptions: 2 });
      expect((await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { code: code('NEW') })).status).toBe(409);
      expect((await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { amountOff: 800 })).status).toBe(409);
      expect((await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { courseId: course.id })).status).toBe(409);
      expect((await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { maxRedemptions: 1 })).status).toBe(400); // below uses
      res = await as(teacher).put(`/api/teacher/coupons/${coupon.id}`, { amountOff: 700, currency: 'usd', active: false, maxRedemptions: 10, expiresAt: '2099-01-01' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ active: false, maxRedemptions: 10, amountOff: 700, redemptions: 2 });
    });

    test('another teacher cannot edit or delete it; unknown id is 404', async () => {
      const coupon = await makeCoupon(teacher);
      expect((await as(otherTeacher).put(`/api/teacher/coupons/${coupon.id}`, { active: false })).status).toBe(403);
      expect((await as(otherTeacher).delete(`/api/teacher/coupons/${coupon.id}`)).status).toBe(403);
      expect((await as(teacher).put('/api/teacher/coupons/2147483646', { active: false })).status).toBe(404);
      expect((await as(teacher).delete('/api/teacher/coupons/abc')).status).toBe(404);
      expect((await Coupon.findByPk(coupon.id)).active).toBe(true);
    });

    test('delete: an unused coupon is removed; one with uses is kept and deactivated (409)', async () => {
      const unused = await makeCoupon(teacher);
      expect((await as(teacher).delete(`/api/teacher/coupons/${unused.id}`)).status).toBe(204);
      expect(await Coupon.findByPk(unused.id)).toBeNull();

      const used = await makeCoupon(teacher, { redemptions: 1 });
      const res = await as(teacher).delete(`/api/teacher/coupons/${used.id}`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ deactivated: true });
      expect(res.body.error).toBeTruthy();
      expect((await Coupon.findByPk(used.id)).active).toBe(false);
    });
  });

  describe('quote', () => {
    const quote = (couponCode, courseId = course.id) => as(null).post('/api/checkout/quote', { courseId, couponCode });

    test('percentage and fixed amount, case-insensitive code', async () => {
      const pct = await makeCoupon(teacher, { percentOff: 15 });
      let res = await quote(pct.code.toLowerCase());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ originalAmount: 10000, discountAmount: 1500, amount: 8500, currency: 'usd', coupon: { code: pct.code, percentOff: 15, amountOff: null } });

      const fixed = await makeCoupon(teacher, { percentOff: null, amountOff: 2500, currency: 'usd' });
      res = await quote(fixed.code);
      expect(res.body).toMatchObject({ discountAmount: 2500, amount: 7500, coupon: { percentOff: null, amountOff: 2500 } });
    });

    test('100 percent quotes 0', async () => {
      const free = await makeCoupon(teacher, { percentOff: 100 });
      expect((await quote(free.code)).body).toMatchObject({ discountAmount: 10000, amount: 0 });
    });

    test.each([
      ['unknown code', async () => 'NOPE-NOPE', 'coupon_invalid'],
      ['inactive', async () => (await makeCoupon(teacher, { active: false })).code, 'coupon_invalid'],
      ['another teacher\'s coupon', async () => (await makeCoupon(otherTeacher)).code, 'coupon_invalid'],
      ['expired', async () => (await makeCoupon(teacher, { expiresAt: new Date(Date.now() - 1000) })).code, 'coupon_expired'],
      ['exhausted', async () => (await makeCoupon(teacher, { maxRedemptions: 2, redemptions: 2 })).code, 'coupon_exhausted'],
      ['for another course', async () => (await makeCoupon(teacher, { courseId: eurCourse.id })).code, 'coupon_not_applicable'],
      ['amount in another currency', async () => (await makeCoupon(teacher, { percentOff: null, amountOff: 100, currency: 'eur' })).code, 'coupon_not_applicable'],
      ['final price under 50 cents', async () => (await makeCoupon(teacher, { percentOff: null, amountOff: 9980, currency: 'usd' })).code, 'coupon_not_applicable']
    ])('%s -> 400 %s', async (_label, make, expected) => {
      const res = await quote(await make());
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(expected);
      expect(res.body.error).toBeTruthy();
    });

    test('a course-specific coupon works on its course; missing code, unknown or free course are rejected', async () => {
      const specific = await makeCoupon(teacher, { courseId: eurCourse.id, percentOff: 20 });
      expect((await quote(specific.code, eurCourse.id)).body).toMatchObject({ amount: 4000, currency: 'eur' });
      expect((await as(null).post('/api/checkout/quote', { courseId: course.id })).status).toBe(400);
      expect((await quote('X', 2147483646)).status).toBe(404);
      const free = await newCourse(teacher);
      await free.update({ isPublished: true, price: 0 });
      expect((await quote(specific.code, free.id)).status).toBe(400);
    });
  });

  describe('checkout with a coupon', () => {
    test('fake checkout charges the discounted amount, keeps the original price and counts the use once paid', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 25 });
      const email = `c-${randomUUID()}@jest.test`;
      const res = await as(null).post('/api/checkout', { courseId: course.id, email, couponCode: coupon.code.toLowerCase() });
      expect(res.status).toBe(200);
      const order = await Order.findOne({ where: { providerSessionId: sessionIdOf(res.body.url) } });
      expect(order).toMatchObject({ amount: 7500, originalAmount: 10000, discountAmount: 2500, couponId: coupon.id, status: 'paid', provider: 'fake', refundedAmount: 0 });
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(1);
      expect(mailsTo(email)[0].text).toMatch(/USD\s+75\.00/);
    });

    test('an order without a coupon records the full price and no discount', async () => {
      const res = await as(null).post('/api/checkout', { courseId: course.id, email: `n-${randomUUID()}@jest.test` });
      const order = await Order.findOne({ where: { providerSessionId: sessionIdOf(res.body.url) } });
      expect(order).toMatchObject({ amount: 10000, originalAmount: 10000, discountAmount: 0, couponId: null });
    });

    test('an invalid coupon stops the checkout before creating anything', async () => {
      const before = await Order.count({ where: { courseId: course.id } });
      const res = await as(null).post('/api/checkout', { courseId: course.id, email: `x-${randomUUID()}@jest.test`, couponCode: 'NOPE-NOPE' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('coupon_invalid');
      expect(await Order.count({ where: { courseId: course.id } })).toBe(before);
    });

    test('a 100 percent coupon gives access without any provider, in a "coupon" order, and works without Stripe configured', async () => {
      process.env.PAYMENTS_FAKE = '0'; // no Stripe keys either: still works
      const coupon = await makeCoupon(teacher, { percentOff: 100 });
      const email = `gift-${randomUUID()}@jest.test`;
      const res = await as(null).post('/api/checkout', { courseId: course.id, email, couponCode: coupon.code });
      expect(res.status).toBe(200);
      const sessionId = sessionIdOf(res.body.url);
      expect(sessionId).toMatch(/^coupon_/);
      expect(res.body.url).toBe(`http://localhost:4200/checkout/success?session_id=${sessionId}`);

      const order = await Order.findOne({ where: { providerSessionId: sessionId } });
      expect(order).toMatchObject({ provider: 'coupon', amount: 0, originalAmount: 10000, discountAmount: 10000, status: 'paid', email });
      const user = await User.findOne({ where: { email } });
      expect(await Enrollment.findOne({ where: { studentId: user.id, courseId: course.id, source: 'purchase', orderId: order.id } })).not.toBeNull();
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(1);
      expect((await as(null).get(`/api/checkout/session/${sessionId}`)).body).toMatchObject({ status: 'paid', email, needsPassword: true });
      expect(mailsTo(email)).toHaveLength(1);
    });

    test('a 100 percent order needs a valid email (anonymous) and refuses someone already enrolled', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 100 });
      const before = await Order.count({ where: { courseId: course.id } });
      expect((await as(null).post('/api/checkout', { courseId: course.id, couponCode: coupon.code })).status).toBe(400);
      expect((await as(null).post('/api/checkout', { courseId: course.id, email: 'not-an-email', couponCode: coupon.code })).status).toBe(400);
      expect(await Order.count({ where: { courseId: course.id } })).toBe(before);

      const student = await createUser('student', 'gift-student');
      await Enrollment.create({ studentId: student.id, courseId: course.id });
      expect((await as(student).post('/api/checkout', { courseId: course.id, couponCode: coupon.code })).status).toBe(409);
      expect((await as(null).post('/api/checkout', { courseId: course.id, email: student.email, couponCode: coupon.code })).status).toBe(409);
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(0);
    });

    test('a logged-in student uses their own account for the free order', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 100 });
      const student = await createUser('student', 'gift-logged');
      const res = await as(student).post('/api/checkout', { courseId: course.id, couponCode: coupon.code });
      expect(res.status).toBe(200);
      expect(await Enrollment.findOne({ where: { studentId: student.id, courseId: course.id, source: 'purchase' } })).not.toBeNull();
    });

    test('the last use of a limited free coupon goes to one buyer only; the other gets coupon_exhausted and no access', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 100, maxRedemptions: 1 });
      const emails = [`r1-${randomUUID()}@jest.test`, `r2-${randomUUID()}@jest.test`];
      const results = await Promise.all(emails.map(email => as(null).post('/api/checkout', { courseId: course.id, email, couponCode: coupon.code })));
      expect(results.map(r => r.status).sort()).toEqual([200, 400]);
      expect(results.find(r => r.status === 400).body.code).toBe('coupon_exhausted');
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(1);
      expect(await Order.count({ where: { couponId: coupon.id, status: 'paid' } })).toBe(1);
      expect(await Order.count({ where: { couponId: coupon.id, status: 'failed' } })).toBeLessThanOrEqual(1);
      const granted = await Enrollment.count({ include: [{ model: User, as: 'student', where: { email: emails } }], where: { courseId: course.id } });
      expect(granted).toBe(1);
    });
  });

  describe('redemptions count paid orders, once', () => {
    test('a pending order does not consume a use; fulfilling counts it once even when called again and concurrently', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 10, maxRedemptions: 5 });
      const order = await Order.create({ courseId: course.id, amount: 9000, originalAmount: 10000, discountAmount: 1000, currency: 'usd', provider: 'stripe', providerSessionId: `cs_${randomUUID()}`, couponId: coupon.id });
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(0);
      const email = `red-${randomUUID()}@jest.test`;
      await Promise.all([fulfillOrder(order, { email }), fulfillOrder(order, { email }), fulfillOrder(order, { email })]);
      await fulfillOrder(order, { email });
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(1);
    });

    test('a purchase paid after the coupon ran out is honoured and the counter does not pass the maximum', async () => {
      const coupon = await makeCoupon(teacher, { percentOff: 10, maxRedemptions: 1, redemptions: 1 });
      const order = await Order.create({ courseId: course.id, amount: 9000, originalAmount: 10000, discountAmount: 1000, currency: 'usd', provider: 'stripe', providerSessionId: `cs_${randomUUID()}`, couponId: coupon.id });
      const result = await fulfillOrder(order, { email: `late-${randomUUID()}@jest.test` });
      expect(result.alreadyPaid).toBe(false);
      expect((await Order.findByPk(order.id)).status).toBe('paid');
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(1);
    });
  });

  describe('Stripe checkout with a coupon', () => {
    afterEach(() => { setStripeClient(null); delete process.env.STRIPE_SECRET_KEY; });

    test('the session is created with the final amount; the order stays pending and the coupon unused', async () => {
      const create = jest.fn().mockResolvedValue({ id: `cs_test_${randomUUID()}`, url: 'https://checkout.stripe.test/pay' });
      process.env.PAYMENTS_FAKE = '0';
      process.env.STRIPE_SECRET_KEY = 'sk_test_jest';
      setStripeClient({ checkout: { sessions: { create } } });
      const coupon = await makeCoupon(teacher, { percentOff: 15 });

      const res = await as(null).post('/api/checkout', { courseId: course.id, couponCode: coupon.code });
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.test/pay');
      const args = create.mock.calls[0][0];
      expect(args.line_items[0].price_data.unit_amount).toBe(8500);
      expect(args.line_items[0].price_data.currency).toBe('usd');
      expect(args.metadata.couponCode).toBe(coupon.code);
      const order = await Order.findOne({ where: { providerSessionId: (await create.mock.results[0].value).id } });
      expect(order).toMatchObject({ status: 'pending', amount: 8500, originalAmount: 10000, discountAmount: 1500, couponId: coupon.id });
      expect((await Coupon.findByPk(coupon.id)).redemptions).toBe(0);
    });

    test('a 100 percent coupon never calls Stripe', async () => {
      const create = jest.fn();
      process.env.PAYMENTS_FAKE = '0';
      process.env.STRIPE_SECRET_KEY = 'sk_test_jest';
      setStripeClient({ checkout: { sessions: { create } } });
      const coupon = await makeCoupon(teacher, { percentOff: 100 });
      const res = await as(null).post('/api/checkout', { courseId: course.id, email: `s-${randomUUID()}@jest.test`, couponCode: coupon.code });
      expect(res.status).toBe(200);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('course series fields (PUT /api/courses/:id)', () => {
    test('stores nextCourseId and the coupon, returns them in GET, and null clears them', async () => {
      const first = await newCourse(teacher);
      const second = await publish(await newCourse(teacher));
      const offer = await makeCoupon(teacher, { courseId: second.id });
      const res = await as(teacher).put(`/api/courses/${first.id}`, { nextCourseId: second.id, nextCourseCouponId: offer.id });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nextCourseId: second.id, nextCourseCouponId: offer.id });
      const detail = await as(teacher).get(`/api/courses/${first.id}`);
      expect(detail.body).toMatchObject({ nextCourseId: second.id, nextCourseCouponId: offer.id });

      const cleared = await as(teacher).put(`/api/courses/${first.id}`, { nextCourseId: null, nextCourseCouponId: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body).toMatchObject({ nextCourseId: null, nextCourseCouponId: null });
    });

    test('rejects itself, another teacher\'s course or coupon, a coupon for a different course, and bad ids', async () => {
      const first = await newCourse(teacher);
      const second = await newCourse(teacher);
      const other = await newCourse(otherTeacher);
      const put = body => as(teacher).put(`/api/courses/${first.id}`, body);
      expect((await put({ nextCourseId: first.id })).status).toBe(400);
      expect((await put({ nextCourseId: other.id })).status).toBe(400);
      expect((await put({ nextCourseId: 2147483646 })).status).toBe(400);
      expect((await put({ nextCourseId: 'abc' })).status).toBe(400);
      expect((await put({ nextCourseId: second.id, nextCourseCouponId: (await makeCoupon(otherTeacher)).id })).status).toBe(400);
      expect((await put({ nextCourseId: second.id, nextCourseCouponId: (await makeCoupon(teacher, { courseId: first.id })).id })).status).toBe(400);
      expect((await Course.findByPk(first.id)).nextCourseId).toBeNull();
    });

    test('without a next course the coupon is dropped; updates that do not mention the series leave it alone', async () => {
      const first = await newCourse(teacher);
      const second = await newCourse(teacher);
      const offer = await makeCoupon(teacher);
      await as(teacher).put(`/api/courses/${first.id}`, { nextCourseId: second.id, nextCourseCouponId: offer.id });
      await as(teacher).put(`/api/courses/${first.id}`, { title: 'Nuevo título' });
      expect(await Course.findByPk(first.id)).toMatchObject({ title: 'Nuevo título', nextCourseId: second.id, nextCourseCouponId: offer.id });
      const res = await as(teacher).put(`/api/courses/${first.id}`, { nextCourseId: '', nextCourseCouponId: offer.id });
      expect(res.body).toMatchObject({ nextCourseId: null, nextCourseCouponId: null });
    });
  });
});
