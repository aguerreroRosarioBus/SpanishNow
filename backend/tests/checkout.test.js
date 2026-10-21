// Checkout (fake provider end to end, Stripe webhook), fulfillOrder, free/paid enrolment and course access.
const Stripe = require('stripe');
const request = require('supertest');
const { randomUUID } = require('crypto');
const { Order, Enrollment, User, PasswordToken, Course } = require('../src/models');
const { fulfillOrder } = require('../src/services/orderService');
const { clearOutbox } = require('../src/services/mailService');
const { app, as, createWorld, createUser } = require('./helpers/fixtures');
const { publish, newCourse, mailsTo, tokenFromMail } = require('./helpers/sales');

const sessionIdOf = url => new URL(url).searchParams.get('session_id');

describe('selling courses', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });
  beforeEach(() => { process.env.PAYMENTS_FAKE = '1'; clearOutbox(); });
  afterEach(() => { process.env.PAYMENTS_FAKE = '0'; });

  describe('fake checkout end to end', () => {
    test('an anonymous buyer pays, gets an account, an enrollment, an email with the set-password link and can log in', async () => {
      const course = await publish(await newCourse(world.teacher));
      const email = `buyer-${randomUUID()}@jest.test`;

      const res = await as(null).post('/api/checkout', { courseId: course.id, email });
      expect(res.status).toBe(200);
      const sessionId = sessionIdOf(res.body.url);
      expect(res.body.url).toBe(`http://localhost:4200/checkout/success?session_id=${sessionId}`);
      expect(sessionId).toMatch(/^fake_/);

      const status = await as(null).get(`/api/checkout/session/${sessionId}`);
      expect(status.status).toBe(200);
      expect(status.body).toEqual({ status: 'paid', course: { title: course.title, slug: course.slug }, email, needsPassword: true });

      const user = await User.findOne({ where: { email } });
      expect(user.role).toBe('student');
      const enrollment = await Enrollment.findOne({ where: { studentId: user.id, courseId: course.id } });
      expect(enrollment.source).toBe('purchase');
      const order = await Order.findOne({ where: { providerSessionId: sessionId } });
      expect(order).toMatchObject({ status: 'paid', provider: 'fake', amount: 1999, currency: 'usd', userId: user.id });
      expect(order.paidAt).toBeInstanceOf(Date);
      expect(enrollment.orderId).toBe(order.id);

      const [mail] = mailsTo(email);
      expect(mailsTo(email)).toHaveLength(1);
      expect(mail.subject).toContain(course.title);
      expect(mail.text).toContain('$19.99');
      expect(mail.text).toContain('Set your password');
      expect(mail.text).toContain('/auth/reset-password?token=');
      expect(mail.text).toContain('invite=1');

      // The link lets the new student choose a password and enter.
      const reset = await as(null).post('/api/auth/reset-password', { token: tokenFromMail(mail), password: 'my-new-pass' });
      expect(reset.status).toBe(200);
      expect(reset.body.user).toMatchObject({ email, role: 'student' });
      const login = await as(null).post('/api/auth/login', { email, password: 'my-new-pass' });
      expect(login.status).toBe(200);
      expect((await as(null).get(`/api/checkout/session/${sessionId}`)).body.needsPassword).toBe(false);
      const mine = await as({ token: login.body.token }).get('/api/enrollments/my-courses');
      expect(mine.body.map(e => e.courseId)).toContain(course.id);
    });

    test('a logged-in student buys with their own account; buying twice is a 409', async () => {
      const course = await publish(await newCourse(world.teacher), { price: 500, currency: 'eur' });
      const buyer = await createUser('student', 'buyer');

      const res = await as(buyer).post('/api/checkout', { courseId: course.id });
      expect(res.status).toBe(200);
      const order = await Order.findOne({ where: { providerSessionId: sessionIdOf(res.body.url) } });
      expect(order).toMatchObject({ status: 'paid', userId: buyer.id, email: buyer.email, currency: 'eur', amount: 500 });
      const enrollment = await Enrollment.findOne({ where: { studentId: buyer.id, courseId: course.id } });
      expect(enrollment.source).toBe('purchase');
      // An existing account does not get a set-password link.
      expect(mailsTo(buyer.email)[0].text).toContain('Start learning');
      expect(mailsTo(buyer.email)[0].text).not.toContain('invite=1');

      const again = await as(buyer).post('/api/checkout', { courseId: course.id });
      expect(again.status).toBe(409);
      expect(await Order.count({ where: { courseId: course.id } })).toBe(1);
    });

    test('anonymous purchase with the email of an existing account reuses it', async () => {
      const course = await publish(await newCourse(world.teacher));
      const existing = await createUser('student', 'existing');
      const before = await User.count();

      const res = await as(null).post('/api/checkout', { courseId: course.id, email: existing.email.toUpperCase() });
      expect(res.status).toBe(200);
      expect(await User.count()).toBe(before);
      expect(await Enrollment.count({ where: { studentId: existing.id, courseId: course.id } })).toBe(1);
    });

    test('validations: free course 400, unpublished or unknown 404, teacher 403, missing id 400', async () => {
      const free = await publish(await newCourse(world.teacher), { price: 0 });
      const draft = await newCourse(world.teacher, { price: 1000 });
      expect((await as(null).post('/api/checkout', { courseId: free.id })).status).toBe(400);
      expect((await as(null).post('/api/checkout', { courseId: draft.id })).status).toBe(404);
      expect((await as(null).post('/api/checkout', { courseId: 99999999 })).status).toBe(404);
      expect((await as(null).post('/api/checkout', {})).status).toBe(400);
      const paid = await publish(await newCourse(world.teacher));
      expect((await as(world.teacher).post('/api/checkout', { courseId: paid.id })).status).toBe(403);
      // a stale token is treated as anonymous
      expect((await as({ token: 'garbage' }).post('/api/checkout', { courseId: paid.id })).status).toBe(200);
    });

    test('unknown session is 404; without fake mode and without Stripe keys checkout is 503', async () => {
      expect((await as(null).get('/api/checkout/session/fake_nope')).status).toBe(404);
      process.env.PAYMENTS_FAKE = '0';
      const course = await publish(await newCourse(world.teacher));
      const res = await as(null).post('/api/checkout', { courseId: course.id });
      expect(res.status).toBe(503);
    });
  });

  describe('fulfillOrder', () => {
    async function pendingOrder(course, email) {
      return Order.create({ courseId: course.id, email, amount: course.price, currency: 'usd', provider: 'stripe', providerSessionId: `cs_test_${randomUUID()}` });
    }

    test('is idempotent: calling it again changes nothing and sends no second email', async () => {
      const course = await publish(await newCourse(world.teacher));
      const email = `idem-${randomUUID()}@jest.test`;
      const order = await pendingOrder(course, email);

      const first = await fulfillOrder(order, { email, name: 'Idem Potent', paymentId: 'pi_1' });
      expect(first.alreadyPaid).toBe(false);
      expect(first.userCreated).toBe(true);
      const second = await fulfillOrder(order, { email });
      expect(second.alreadyPaid).toBe(true);

      expect(await User.count({ where: { email } })).toBe(1);
      const user = await User.findOne({ where: { email } });
      expect(user.name).toBe('Idem Potent');
      expect(await Enrollment.count({ where: { studentId: user.id, courseId: course.id } })).toBe(1);
      expect(await PasswordToken.count({ where: { userId: user.id, purpose: 'invite' } })).toBe(1);
      expect(mailsTo(email)).toHaveLength(1);
      expect((await Order.findByPk(order.id)).providerPaymentId).toBe('pi_1');
    });

    test('concurrent deliveries create one enrollment and one email', async () => {
      const course = await publish(await newCourse(world.teacher));
      const email = `race-${randomUUID()}@jest.test`;
      const order = await pendingOrder(course, email);

      await Promise.all([1, 2, 3].map(() => fulfillOrder(order.id, { email })));
      const user = await User.findOne({ where: { email } });
      expect(await Enrollment.count({ where: { studentId: user.id, courseId: course.id } })).toBe(1);
      expect(mailsTo(email)).toHaveLength(1);
    });

    test('keeps an enrollment that already existed (manual) and only links the order', async () => {
      const course = await publish(await newCourse(world.teacher));
      const student = await createUser('student', 'preenrolled');
      await Enrollment.create({ studentId: student.id, courseId: course.id, source: 'manual' });
      const order = await pendingOrder(course, student.email);

      await fulfillOrder(order, { email: student.email });
      const enrollments = await Enrollment.findAll({ where: { studentId: student.id, courseId: course.id } });
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0]).toMatchObject({ source: 'manual', orderId: order.id });
    });

    test('a mail failure does not undo the payment', async () => {
      const course = await publish(await newCourse(world.teacher));
      const email = `nomail-${randomUUID()}@jest.test`;
      const order = await pendingOrder(course, email);
      const previous = process.env.MAIL_TRANSPORT;
      process.env.MAIL_TRANSPORT = 'carrier-pigeon';
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const result = await fulfillOrder(order, { email });
        expect(result.emailSent).toBe(false);
      } finally { process.env.MAIL_TRANSPORT = previous; spy.mockRestore(); }
      expect((await Order.findByPk(order.id)).status).toBe('paid');
    });
  });

  describe('Stripe webhook', () => {
    const secret = () => process.env.STRIPE_WEBHOOK_SECRET;
    const deliver = (payload, { signature, secretOverride } = {}) => {
      const body = JSON.stringify(payload);
      const header = signature || Stripe.webhooks.generateTestHeaderString({ payload: body, secret: secretOverride || secret() });
      return request(app).post('/api/payments/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(body);
    };
    const completed = (sessionId, extra = {}) => ({
      id: `evt_${randomUUID()}`, object: 'event', type: 'checkout.session.completed',
      data: { object: { id: sessionId, object: 'checkout.session', payment_status: 'paid', amount_total: 1999, payment_intent: 'pi_test_1',
        customer_details: { email: extra.email, name: 'Stripe Buyer' } } }
    });

    test('a signed checkout.session.completed fulfils the order once, even when delivered twice', async () => {
      const course = await publish(await newCourse(world.teacher));
      const order = await Order.create({ courseId: course.id, amount: 1999, currency: 'usd', provider: 'stripe', providerSessionId: `cs_test_${randomUUID()}` });
      const email = `stripe-${randomUUID()}@jest.test`;
      const event = completed(order.providerSessionId, { email });

      expect((await deliver(event)).status).toBe(200);
      expect((await deliver(event)).status).toBe(200);

      const paid = await Order.findByPk(order.id);
      expect(paid).toMatchObject({ status: 'paid', email, providerPaymentId: 'pi_test_1' });
      const user = await User.findOne({ where: { email } });
      expect(user.name).toBe('Stripe Buyer');
      expect(await Enrollment.count({ where: { studentId: user.id, courseId: course.id } })).toBe(1);
      expect(mailsTo(email)).toHaveLength(1);

      const status = await as(null).get(`/api/checkout/session/${order.providerSessionId}`);
      expect(status.body).toMatchObject({ status: 'paid', email, needsPassword: true });
    });

    test('a bad signature is 400 and changes nothing; a session without order is ignored', async () => {
      const course = await publish(await newCourse(world.teacher));
      const order = await Order.create({ courseId: course.id, amount: 1999, currency: 'usd', provider: 'stripe', providerSessionId: `cs_test_${randomUUID()}` });
      const event = completed(order.providerSessionId, { email: `bad-${randomUUID()}@jest.test` });

      expect((await deliver(event, { secretOverride: 'whsec_other' })).status).toBe(400);
      expect((await deliver(event, { signature: 't=1,v1=abc' })).status).toBe(400);
      expect((await Order.findByPk(order.id)).status).toBe('pending');

      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const unknown = await deliver(completed('cs_test_unknown', { email: 'x@jest.test' }));
      warn.mockRestore();
      expect(unknown.status).toBe(200);
      expect(unknown.body.ignored).toBe(true);
    });

    test('an unpaid session or another event type is acknowledged and ignored', async () => {
      const course = await publish(await newCourse(world.teacher));
      const order = await Order.create({ courseId: course.id, amount: 1999, currency: 'usd', provider: 'stripe', providerSessionId: `cs_test_${randomUUID()}` });
      const unpaid = completed(order.providerSessionId, { email: 'u@jest.test' });
      unpaid.data.object.payment_status = 'unpaid';
      expect((await deliver(unpaid)).body.ignored).toBe(true);
      expect((await deliver({ id: 'evt_x', type: 'charge.refunded', data: { object: {} } })).body.ignored).toBe(true);
      expect((await Order.findByPk(order.id)).status).toBe('pending');
    });
  });

  describe('enrollment and catalog access', () => {
    test('POST /enrollments: free published course 201 (source free), paid 402, unpublished 404', async () => {
      const student = await createUser('student', 'learner');
      const free = await publish(await newCourse(world.teacher), { price: 0 });
      const paid = await publish(await newCourse(world.teacher), { price: 1500 });
      const draft = await newCourse(world.teacher);

      const ok = await as(student).post('/api/enrollments', { courseId: free.id });
      expect(ok.status).toBe(201);
      expect(ok.body.source).toBe('free');
      expect((await as(student).post('/api/enrollments', { courseId: free.id })).status).toBe(400);

      const blocked = await as(student).post('/api/enrollments', { courseId: paid.id });
      expect(blocked.status).toBe(402);
      expect(blocked.body).toEqual({ error: expect.any(String), checkoutRequired: true, slug: paid.slug });
      expect(await Enrollment.count({ where: { studentId: student.id, courseId: paid.id } })).toBe(0);

      expect((await as(student).post('/api/enrollments', { courseId: draft.id })).status).toBe(404);
      expect((await as(student).post('/api/enrollments', { courseId: 'abc' })).status).toBe(404);
    });

    test('GET /courses: students see only published courses, with price, currency and slug; teachers see their own', async () => {
      const published = await publish(await newCourse(world.teacher));
      const draft = await newCourse(world.teacher);

      const asStudent = await as(world.student).get('/api/courses');
      const ids = asStudent.body.map(c => c.id);
      expect(ids).toContain(published.id);
      expect(ids).not.toContain(draft.id);
      expect(asStudent.body.find(c => c.id === published.id)).toMatchObject({ price: 1999, currency: 'usd', slug: published.slug });

      const mine = (await as(world.teacher).get('/api/courses')).body.map(c => c.id);
      expect(mine).toEqual(expect.arrayContaining([published.id, draft.id]));
      expect(mine).not.toContain(world.foreignCourse.id);
    });

    test('public catalog and sales page expose only published courses and no lesson text', async () => {
      const published = await publish(await newCourse(world.teacher));
      const draft = await newCourse(world.teacher);
      const { Unit, Story } = require('../src/models');
      const unit = await Unit.create({ courseId: published.id, title: 'Unit 1', description: 'x', order: 1 });
      await Story.create({ unitId: unit.id, title: 'Lesson 1', text: 'SECRET TEXT', order: 1 });

      const list = await as(null).get('/api/public/courses');
      expect(list.status).toBe(200);
      expect(list.body.map(c => c.id)).toContain(published.id);
      expect(list.body.map(c => c.id)).not.toContain(draft.id);
      expect(list.body.find(c => c.id === published.id)).toEqual({
        id: published.id, slug: published.slug, title: published.title, description: 'Descripción', level: 'A1', imageUrl: null,
        price: 1999, currency: 'usd', teacher: { name: world.teacher.name }
      });

      const page = await as(null).get(`/api/public/courses/${published.slug}`);
      expect(page.status).toBe(200);
      expect(page.body.salesDescription).toBe('Learn Spanish with a short film.');
      expect(page.body.units).toEqual([{ id: unit.id, title: 'Unit 1', order: 1, stories: [{ id: expect.any(Number), title: 'Lesson 1', order: 1 }] }]);
      expect(JSON.stringify(page.body)).not.toContain('SECRET TEXT');

      await draft.update({ slug: 'borrador-oculto' });
      expect((await as(null).get('/api/public/courses/borrador-oculto')).status).toBe(404);
      expect((await as(null).get('/api/public/courses/no-existe')).status).toBe(404);
    });
  });

  describe('teacher edits the sales fields', () => {
    test('PUT /courses/:id accepts JSON and multipart strings, validates, generates the slug and rejects duplicates', async () => {
      const course = await newCourse(world.teacher, { title: 'Aprende español: Parte 1' });
      expect(course.slug).toMatch(/^aprende-espanol-parte-1(-\d+)?$/);

      const json = await as(world.teacher).put(`/api/courses/${course.id}`, { title: course.title, description: 'd', level: 'A1', price: 2500, currency: 'GBP', isPublished: true, salesDescription: 'Long text' });
      expect(json.status).toBe(200);
      expect(json.body).toMatchObject({ price: 2500, currency: 'gbp', isPublished: true, salesDescription: 'Long text', slug: course.slug });

      const multipart = await request(app).put(`/api/courses/${course.id}`).set('Authorization', `Bearer ${world.teacher.token}`)
        .field('title', course.title).field('price', '3000').field('isPublished', 'false').field('slug', 'mi-curso-jest');
      expect(multipart.status).toBe(200);
      expect(multipart.body).toMatchObject({ price: 3000, isPublished: false, slug: 'mi-curso-jest' });

      for (const bad of [{ price: -1 }, { price: 'abc' }, { price: 1.5 }, { currency: 'dollars' }, { isPublished: 'maybe' }, { slug: 'Not A Slug' }]) {
        const res = await as(world.teacher).put(`/api/courses/${course.id}`, { title: course.title, ...bad });
        expect(res.status).toBe(400);
      }
      const other = await newCourse(world.teacher);
      const clash = await as(world.teacher).put(`/api/courses/${other.id}`, { title: other.title, slug: 'mi-curso-jest' });
      expect(clash.status).toBe(409);
      expect((await Course.findByPk(other.id)).slug).not.toBe('mi-curso-jest');
    });

    test('a course with orders cannot be deleted', async () => {
      const course = await publish(await newCourse(world.teacher));
      expect((await as(null).post('/api/checkout', { courseId: course.id })).status).toBe(200);
      expect((await as(world.teacher).delete(`/api/courses/${course.id}`)).status).toBe(409);
      const empty = await newCourse(world.teacher);
      expect((await as(world.teacher).delete(`/api/courses/${empty.id}`)).status).toBe(200);
    });
  });
});
