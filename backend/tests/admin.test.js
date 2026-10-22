// Admin panel API (docs/admin/SPEC.md): permission gating, roles, suspension, test accounts, "sign in as" and deletion.
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { randomUUID } = require('crypto');
const {
  User, Course, Unit, Story, Enrollment, LessonPlan, LessonProgress, LessonComment, Order, Coupon, Affiliate
} = require('../src/models');
const { clearOutbox, getOutbox } = require('../src/services/mailService');
const { app, as, createUser, tokenFor } = require('./helpers/fixtures');
const { newCourse } = require('./helpers/sales');

const PASSWORD = 'jest-password-1';
const tag = () => randomUUID().slice(0, 8);

// helpers/fixtures.js `as` has no PATCH
const patchAs = (user, id, body) => {
  const req = request(app).patch(`/api/admin/users/${id}`);
  return (user ? req.set('Authorization', `Bearer ${user.token}`) : req).send(body);
};

/** A user (teacher by default) holding the given admin permissions. */
async function adminWith(permissions, role = 'teacher') {
  const user = await createUser(role, 'admin');
  await user.update({ permissions });
  return user;
}

/** A test account made directly in the database (the API creation is covered separately). */
async function testAccount(role = 'student', values = {}) {
  const user = await createUser(role, 'prueba');
  await user.update({ isTestAccount: true, ...values });
  return user;
}

/** Course with one unit, one story with a published plan; returns everything needed to attach progress. */
async function courseWithLesson(teacher) {
  const course = await newCourse(teacher);
  const unit = await Unit.create({ courseId: course.id, title: 'U', description: 'x', order: 0 });
  const story = await Story.create({ unitId: unit.id, title: 'A', text: 't', order: 0 });
  const plan = await LessonPlan.create({ storyId: story.id, revision: 1, status: 'published' });
  return { course, unit, story, plan };
}

const enrollWithProgress = async (student, { course, story, plan }) => {
  const enrollment = await Enrollment.create({ studentId: student.id, courseId: course.id });
  const progress = await LessonProgress.create({ enrollmentId: enrollment.id, storyId: story.id, planId: plan.id, narrativeCompleted: true });
  return { enrollment, progress };
};

const exists = (Model, id) => Model.count({ where: { id } }).then(n => n === 1);

describe('admin API', () => {
  let usersAdmin; let testAdmin; let plain;
  beforeAll(async () => {
    [usersAdmin, testAdmin, plain] = await Promise.all([
      adminWith(['users.manage']), adminWith(['test_users.manage']), createUser('teacher', 'plain')
    ]);
  });
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  describe('permission gating', () => {
    test('anonymous 401; users without permissions 403 on every endpoint', async () => {
      const target = await testAccount();
      for (const [user, status] of [[null, 401], [plain, 403]]) {
        const responses = await Promise.all([
          as(user).get('/api/admin/permissions'),
          as(user).get('/api/admin/users'),
          patchAs(user, target.id, { role: 'teacher' }),
          as(user).post('/api/admin/test-users', { role: 'student' }),
          as(user).post(`/api/admin/users/${target.id}/impersonate`),
          as(user).delete(`/api/admin/test-users/${target.id}`),
          as(user).delete('/api/admin/test-users')
        ]);
        expect(responses.map(r => r.status)).toEqual(Array(7).fill(status));
      }
      expect(await exists(User, target.id)).toBe(true);
      expect((await target.reload()).role).toBe('student');
    });

    test('each permission opens only its own endpoints', async () => {
      const target = await testAccount();
      const patch = (user, body) => patchAs(user, target.id, body);

      expect((await as(usersAdmin).get('/api/admin/permissions')).status).toBe(200);
      expect((await as(testAdmin).get('/api/admin/permissions')).status).toBe(200);
      expect((await as(usersAdmin).get('/api/admin/users')).status).toBe(200);
      expect((await patch(usersAdmin, { role: 'student' })).status).toBe(200);
      expect((await patch(testAdmin, { role: 'student' })).status).toBe(403);

      expect((await as(usersAdmin).post('/api/admin/test-users', { role: 'student' })).status).toBe(403);
      expect((await as(usersAdmin).post(`/api/admin/users/${target.id}/impersonate`)).status).toBe(403);
      expect((await as(usersAdmin).delete(`/api/admin/test-users/${target.id}`)).status).toBe(403);
      expect((await as(usersAdmin).delete('/api/admin/test-users')).status).toBe(403);
      expect(await exists(User, target.id)).toBe(true);
    });

    test('the catalog lists both permissions', async () => {
      const res = await as(usersAdmin).get('/api/admin/permissions');
      expect(res.body).toEqual([
        { key: 'users.manage', label: expect.any(String), description: expect.any(String) },
        { key: 'test_users.manage', label: expect.any(String), description: expect.any(String) }
      ]);
    });

    test('a student can hold permissions too: permissions sit on top of the role', async () => {
      const student = await adminWith(['users.manage'], 'student');
      expect((await as(student).get('/api/admin/users')).status).toBe(200);
    });
  });

  describe('listing', () => {
    test('test_users.manage only sees test accounts; users.manage sees everyone and can filter', async () => {
      const label = tag();
      const real = await createUser('student', `real-${label}`);
      const test = await testAccount('student');
      await test.update({ name: `Prueba ${label}` });
      await real.update({ name: `Real ${label}` });

      const asTestAdmin = await as(testAdmin).get(`/api/admin/users?search=${label}&kind=real`);
      expect(asTestAdmin.status).toBe(200);
      expect(asTestAdmin.body.users.every(u => u.isTestAccount)).toBe(true);
      expect(asTestAdmin.body.users.map(u => u.id)).not.toContain(real.id);

      const all = await as(usersAdmin).get(`/api/admin/users?search=${label}`);
      expect(all.body.users.map(u => u.id).sort()).toEqual([real.id, test.id].sort());
      expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 25 });
      const onlyTest = await as(usersAdmin).get(`/api/admin/users?search=${label}&kind=test`);
      expect(onlyTest.body.users.map(u => u.id)).toEqual([test.id]);
      const onlyReal = await as(usersAdmin).get(`/api/admin/users?search=${label}&kind=real&role=student`);
      expect(onlyReal.body.users.map(u => u.id)).toEqual([real.id]);
      expect((await as(usersAdmin).get(`/api/admin/users?search=${label}&role=teacher`)).body.total).toBe(0);
      expect((await as(usersAdmin).get('/api/admin/users?role=admin')).status).toBe(400);
    });

    test('user shape, counts, status filter and pagination', async () => {
      const label = tag();
      const teacher = await createUser('teacher', `lister-${label}`);
      const student = await createUser('student', `lister-${label}`);
      const course = await newCourse(teacher);
      await Enrollment.create({ studentId: student.id, courseId: course.id });
      await student.update({ suspendedAt: new Date() });

      const res = await as(usersAdmin).get(`/api/admin/users?search=lister-${label}&pageSize=1&page=2`);
      expect(res.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect(res.body.users).toHaveLength(1);

      const all = (await as(usersAdmin).get(`/api/admin/users?search=lister-${label}`)).body.users;
      expect(all.find(u => u.id === teacher.id)).toEqual({
        id: teacher.id, name: teacher.name, email: teacher.email, role: 'teacher', permissions: [], fixedAdmin: false,
        isTestAccount: false, suspendedAt: null, createdAt: expect.any(String), enrollmentsCount: 0, coursesCount: 1
      });
      expect(all.find(u => u.id === student.id)).toMatchObject({ enrollmentsCount: 1, coursesCount: 0, suspendedAt: expect.any(String) });
      const suspended = await as(usersAdmin).get(`/api/admin/users?search=lister-${label}&status=suspended`);
      expect(suspended.body.users.map(u => u.id)).toEqual([student.id]);
      const active = await as(usersAdmin).get(`/api/admin/users?search=lister-${label}&status=active`);
      expect(active.body.users.map(u => u.id)).toEqual([teacher.id]);
    });
  });

  describe('changing users', () => {
    const patch = patchAs;

    test('role: a teacher with courses cannot become a student; without courses it can; students can become teachers', async () => {
      const owner = await createUser('teacher', 'owner');
      await newCourse(owner);
      const blocked = await patch(usersAdmin, owner.id, { role: 'student' });
      expect(blocked.status).toBe(409);
      expect((await owner.reload()).role).toBe('teacher');

      const idle = await createUser('teacher', 'idle');
      const demoted = await patch(usersAdmin, idle.id, { role: 'student' });
      expect(demoted.status).toBe(200);
      expect(demoted.body).toMatchObject({ id: idle.id, role: 'student' });

      const promoted = await patch(usersAdmin, idle.id, { role: 'teacher' });
      expect(promoted.body.role).toBe('teacher');
      expect((await patch(usersAdmin, idle.id, { role: 'admin' })).status).toBe(400);
      expect((await patch(usersAdmin, 99999999, { role: 'student' })).status).toBe(404);
      expect((await patch(usersAdmin, 'abc', { role: 'student' })).status).toBe(400);
    });

    test('permissions: assigned, listed as effective, and visible in /auth/me', async () => {
      const user = await createUser('student', 'perm');
      const res = await patch(usersAdmin, user.id, { permissions: ['test_users.manage', 'test_users.manage'] });
      expect(res.status).toBe(200);
      expect(res.body.permissions).toEqual(['test_users.manage']);
      expect((await user.reload()).permissions).toEqual(['test_users.manage']);
      const me = await as(user).get('/api/auth/me');
      expect(me.body.user).toMatchObject({ id: user.id, role: 'student', permissions: ['test_users.manage'], isTestAccount: false });
      expect((await as(user).get('/api/admin/users')).status).toBe(200);

      expect((await patch(usersAdmin, user.id, { permissions: [] })).body.permissions).toEqual([]);
      expect((await as(user).get('/api/admin/users')).status).toBe(403);
    });

    test('unknown or malformed permissions are rejected (400)', async () => {
      const user = await createUser('student', 'perm');
      expect((await patch(usersAdmin, user.id, { permissions: ['root'] })).status).toBe(400);
      expect((await patch(usersAdmin, user.id, { permissions: 'users.manage' })).status).toBe(400);
      expect((await patch(usersAdmin, user.id, { permissions: [1] })).status).toBe(400);
      expect((await patch(usersAdmin, user.id, { suspended: 'yes' })).status).toBe(400);
      expect((await user.reload()).permissions).toBeNull();
    });

    test('test accounts can never get permissions', async () => {
      const test = await testAccount();
      const res = await patch(usersAdmin, test.id, { permissions: ['users.manage'] });
      expect(res.status).toBe(400);
      expect((await test.reload()).permissions).toBeNull();
      expect((await patch(usersAdmin, test.id, { permissions: [] })).status).toBe(200);

      // Even if a row had permissions stored, a test account has none in effect.
      await test.update({ permissions: ['users.manage', 'test_users.manage'] });
      expect((await as(test).get('/api/auth/me')).body.user.permissions).toEqual([]);
      expect((await as(test).get('/api/admin/users')).status).toBe(403);
    });

    test('self protection: no suspending yourself and no dropping your own users.manage', async () => {
      const self = await adminWith(['users.manage', 'test_users.manage']);
      expect((await patch(self, self.id, { suspended: true })).status).toBe(409);
      expect((await patch(self, self.id, { permissions: ['test_users.manage'] })).status).toBe(409);
      expect((await patch(self, self.id, { permissions: [] })).status).toBe(409);
      await self.reload();
      expect(self.suspendedAt).toBeNull();
      expect(self.permissions).toEqual(['users.manage', 'test_users.manage']);
      // dropping the other permission is fine
      const res = await patch(self, self.id, { permissions: ['users.manage'] });
      expect(res.status).toBe(200);
      expect(res.body.permissions).toEqual(['users.manage']);
    });

    test('ADMIN_EMAILS: bootstrap admins have every permission, shown as fixed, and cannot be demoted or suspended', async () => {
      const boss = await createUser('teacher', 'boss');
      process.env.ADMIN_EMAILS = ` other@jest.test, ${boss.email.toUpperCase()} `;

      const me = await as(boss).get('/api/auth/me');
      expect(me.body.user.permissions).toEqual(['users.manage', 'test_users.manage']);
      expect((await as(boss).get('/api/admin/users')).status).toBe(200);

      const row = (await as(usersAdmin).get(`/api/admin/users?search=${encodeURIComponent(boss.email)}`)).body.users[0];
      expect(row).toMatchObject({ id: boss.id, fixedAdmin: true, permissions: ['users.manage', 'test_users.manage'] });

      expect((await patch(usersAdmin, boss.id, { suspended: true })).status).toBe(409);
      expect((await patch(usersAdmin, boss.id, { permissions: [] })).status).toBe(409);
      expect((await patch(usersAdmin, boss.id, { permissions: ['users.manage'] })).status).toBe(409);
      expect((await patch(usersAdmin, boss.id, { permissions: ['users.manage', 'test_users.manage'] })).status).toBe(200);
      expect((await boss.reload()).suspendedAt).toBeNull();
    });

    test('ADMIN_EMAILS is configuration, not data: removing the email removes the permissions', async () => {
      const boss = await createUser('student', 'boss');
      process.env.ADMIN_EMAILS = boss.email;
      expect((await as(boss).get('/api/admin/users')).status).toBe(200);
      delete process.env.ADMIN_EMAILS;
      expect((await as(boss).get('/api/admin/users')).status).toBe(403);
      expect((await as(boss).get('/api/auth/me')).body.user.permissions).toEqual([]);
    });
  });

  describe('suspension', () => {
    const patch = (id, body) => patchAs(usersAdmin, id, body);
    const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

    test('a suspended user cannot sign in and an existing token stops working; reactivating restores both', async () => {
      const user = await createUser('student', 'susp');
      expect((await login(user.email)).status).toBe(200);
      expect((await as(user).get('/api/auth/me')).status).toBe(200);

      const suspended = await patch(user.id, { suspended: true });
      expect(suspended.status).toBe(200);
      expect(suspended.body.suspendedAt).toEqual(expect.any(String));

      const denied = await login(user.email);
      expect(denied.status).toBe(403);
      expect(denied.body).toEqual({ error: 'This account is suspended' });
      expect((await login(user.email, 'wrong-password')).status).toBe(401); // does not reveal the suspension
      const blocked = await as(user).get('/api/auth/me');
      expect(blocked.status).toBe(401);
      expect(blocked.body).toEqual({ error: 'Account suspended' });
      expect((await as(user).get('/api/users/teachers')).status).toBe(401);

      const again = await patch(user.id, { suspended: false });
      expect(again.body.suspendedAt).toBeNull();
      expect((await login(user.email)).status).toBe(200);
      expect((await as(user).get('/api/auth/me')).status).toBe(200);
    });

    test('optional auth treats a suspended user as anonymous', async () => {
      const teacher = await createUser('teacher', 'susp-teacher');
      const course = await newCourse(teacher); // unpublished: only its teacher lists it
      const ids = async user => (await as(user).get('/api/courses')).body.map(c => c.id);
      expect(await ids(teacher)).toContain(course.id);
      await teacher.update({ suspendedAt: new Date() });
      expect(await ids(teacher)).not.toContain(course.id);
    });
  });

  describe('auth payloads', () => {
    test('register, login and /me return permissions and isTestAccount', async () => {
      const email = `payload-${tag()}@jest.test`;
      const registered = await request(app).post('/api/auth/register').send({ name: 'Payload', email, password: PASSWORD });
      expect(registered.status).toBe(201);
      expect(registered.body.user).toEqual({ id: expect.any(Number), name: 'Payload', email, role: 'student', permissions: [], isTestAccount: false });

      const holder = await adminWith(['users.manage']);
      const login = await request(app).post('/api/auth/login').send({ email: holder.email, password: PASSWORD });
      expect(login.body.user).toMatchObject({ id: holder.id, permissions: ['users.manage'], isTestAccount: false });
      expect(login.body.user).not.toHaveProperty('impersonatedBy');
      const me = await as({ token: login.body.token }).get('/api/auth/me');
      expect(me.body.user).toEqual(login.body.user);
      expect((await as(null).get('/api/auth/me')).status).toBe(401);
    });
  });

  describe('creating test accounts', () => {
    beforeEach(() => clearOutbox());

    test('creates a test teacher that can sign in with the returned password, and sends no email', async () => {
      const res = await as(testAdmin).post('/api/admin/test-users', { role: 'teacher', name: 'Profe de prueba' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(1);
      const { user, password } = res.body[0];
      expect(user).toMatchObject({
        name: 'Profe de prueba', role: 'teacher', isTestAccount: true, permissions: [], fixedAdmin: false,
        suspendedAt: null, enrollmentsCount: 0, coursesCount: 0
      });
      expect(user.email).toMatch(/^prueba-teacher-[a-z0-9]{6}@spanishnow\.test$/);
      expect(password.length).toBeGreaterThanOrEqual(8);

      const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
      expect(login.status).toBe(200);
      expect(login.body.user).toMatchObject({ id: user.id, role: 'teacher', isTestAccount: true, permissions: [] });
      expect(getOutbox()).toHaveLength(0);
    });

    test('creates several students enrolled (source manual) in a course', async () => {
      const course = await newCourse(plain);
      const res = await as(testAdmin).post('/api/admin/test-users', { role: 'student', count: 3, courseId: course.id });
      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(3);
      expect(new Set(res.body.map(r => r.user.email)).size).toBe(3);
      expect(new Set(res.body.map(r => r.password)).size).toBe(3);
      const enrollments = await Enrollment.findAll({ where: { courseId: course.id } });
      expect(enrollments).toHaveLength(3);
      expect(enrollments.every(e => e.source === 'manual')).toBe(true);
      expect(res.body.every(r => r.user.enrollmentsCount === 1 && r.user.isTestAccount)).toBe(true);
      expect(await User.count({ where: { id: res.body.map(r => r.user.id), isTestAccount: true } })).toBe(3);
    });

    test('validation: role, count, course only for students, unknown course; nothing is created', async () => {
      const course = await newCourse(plain);
      const before = await User.count({ where: { isTestAccount: true } });
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'admin' })).status).toBe(400);
      expect((await as(testAdmin).post('/api/admin/test-users', {})).status).toBe(400);
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'student', count: 0 })).status).toBe(400);
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'student', count: 11 })).status).toBe(400);
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'student', count: 'x' })).status).toBe(400);
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'teacher', courseId: course.id })).status).toBe(400);
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'student', courseId: 99999999 })).status).toBe(404);
      expect(await User.count({ where: { isTestAccount: true } })).toBe(before);
      expect((await as(testAdmin).post('/api/admin/test-users', { role: 'student', count: 10 })).body).toHaveLength(10);
    });
  });

  describe('signing in as a test account', () => {
    test('only test accounts, token flagged and short lived, admin API closed to it', async () => {
      const test = await testAccount('teacher');
      const res = await as(testAdmin).post(`/api/admin/users/${test.id}/impersonate`);
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: test.id, name: test.name, email: test.email, role: 'teacher', permissions: [], isTestAccount: true, impersonatedBy: testAdmin.id
      });

      const claims = jwt.decode(res.body.token);
      expect(claims).toMatchObject({ id: test.id, role: 'teacher', impersonatedBy: testAdmin.id });
      expect(claims.exp - claims.iat).toBe(2 * 60 * 60);

      const session = { token: res.body.token };
      const me = await as(session).get('/api/auth/me');
      expect(me.body.user).toEqual(res.body.user);
      expect((await as(session).get('/api/courses')).status).toBe(200); // works as that teacher

      // closed to /api/admin, even if the row had permissions and even for the real admin's own endpoints
      await test.update({ permissions: ['users.manage', 'test_users.manage'] });
      for (const call of [
        as(session).get('/api/admin/users'), as(session).get('/api/admin/permissions'),
        as(session).post('/api/admin/test-users', { role: 'student' }), as(session).delete('/api/admin/test-users')
      ]) {
        expect((await call).status).toBe(403);
      }
      // a token carrying the claim of a real admin is refused as well
      const real = await adminWith(['users.manage', 'test_users.manage']);
      const flagged = jwt.sign({ id: real.id, role: real.role, impersonatedBy: testAdmin.id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
      expect((await as({ token: flagged }).get('/api/admin/users')).status).toBe(403);
      expect((await as(real).get('/api/admin/users')).status).toBe(200);
    });

    test('real accounts, unknown ids and suspended test accounts are refused', async () => {
      const real = await createUser('student', 'real');
      expect((await as(testAdmin).post(`/api/admin/users/${real.id}/impersonate`)).status).toBe(403);
      expect((await as(testAdmin).post(`/api/admin/users/${usersAdmin.id}/impersonate`)).status).toBe(403);
      expect((await as(testAdmin).post('/api/admin/users/99999999/impersonate')).status).toBe(404);
      const suspended = await testAccount('student', { suspendedAt: new Date() });
      expect((await as(testAdmin).post(`/api/admin/users/${suspended.id}/impersonate`)).status).toBe(409);
    });
  });

  describe('deleting test accounts', () => {
    test('a real account cannot be deleted, unknown ids are 404', async () => {
      const real = await createUser('student', 'real');
      expect((await as(testAdmin).delete(`/api/admin/test-users/${real.id}`)).status).toBe(403);
      expect((await as(testAdmin).delete('/api/admin/test-users/99999999')).status).toBe(404);
      expect(await exists(User, real.id)).toBe(true);
    });

    test('deletes a test student with their enrollments, progress, orders and comments, only theirs', async () => {
      const realTeacher = await createUser('teacher', 'real-teacher');
      const realStudent = await createUser('student', 'real-student');
      const lesson = await courseWithLesson(realTeacher);
      const coupon = await Coupon.create({ teacherId: realTeacher.id, code: `T${tag().toUpperCase()}`, percentOff: 50, redemptions: 1 });
      const test = await testAccount('student');
      const mine = await enrollWithProgress(test, lesson);
      const kept = await enrollWithProgress(realStudent, lesson);
      const order = await Order.create({
        courseId: lesson.course.id, userId: test.id, amount: 1000, currency: 'usd', status: 'paid', provider: 'fake',
        providerSessionId: `jest-${randomUUID()}`, paidAt: new Date(), couponId: coupon.id
      });
      const realOrder = await Order.create({
        courseId: lesson.course.id, userId: realStudent.id, amount: 1000, currency: 'usd', status: 'paid', provider: 'fake', providerSessionId: `jest-${randomUUID()}`
      });
      const comment = await LessonComment.create({ storyId: lesson.story.id, userId: test.id, body: 'hola' });
      const realComment = await LessonComment.create({ storyId: lesson.story.id, userId: realStudent.id, body: 'hola' });

      const res = await as(testAdmin).delete(`/api/admin/test-users/${test.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 1 });

      expect(await exists(User, test.id)).toBe(false);
      expect(await exists(Enrollment, mine.enrollment.id)).toBe(false);
      expect(await exists(LessonProgress, mine.progress.id)).toBe(false);
      expect(await exists(Order, order.id)).toBe(false);
      expect(await exists(LessonComment, comment.id)).toBe(false);
      // the real course, users and their data are untouched; the coupon use is given back
      for (const [Model, row] of [[User, realTeacher], [User, realStudent], [Course, lesson.course], [Story, lesson.story], [Enrollment, kept.enrollment],
        [LessonProgress, kept.progress], [Order, realOrder], [LessonComment, realComment], [Coupon, coupon]]) {
        expect(await exists(Model, row.id)).toBe(true);
      }
      expect((await coupon.reload()).redemptions).toBe(0);
    });

    test('deletes a test teacher with the course and everything under it, including test students enrolled', async () => {
      const realStudent = await createUser('student', 'real-student');
      const realTeacher = await createUser('teacher', 'real-teacher');
      const teacher = await testAccount('teacher');
      const lesson = await courseWithLesson(teacher);
      const testStudent = await testAccount('student');
      const { enrollment, progress } = await enrollWithProgress(testStudent, lesson);
      const coupon = await Coupon.create({ teacherId: teacher.id, code: `T${tag().toUpperCase()}`, percentOff: 10, courseId: lesson.course.id });
      const affiliate = await Affiliate.create({ teacherId: teacher.id, name: 'Afiliado', email: `af-${tag()}@jest.test`, code: `AF${tag()}`, commissionPercent: 10, dashboardToken: randomUUID() });
      const order = await Order.create({
        courseId: lesson.course.id, userId: testStudent.id, amount: 1000, currency: 'usd', status: 'paid', provider: 'fake',
        providerSessionId: `jest-${randomUUID()}`, couponId: coupon.id, affiliateId: affiliate.id
      });
      const comment = await LessonComment.create({ storyId: lesson.story.id, userId: testStudent.id, body: 'hola' });
      const otherCourse = await newCourse(realTeacher, { nextCourseId: null });
      await lesson.course.update({ nextCourseId: otherCourse.id });
      const otherEnrollment = await Enrollment.create({ studentId: realStudent.id, courseId: otherCourse.id });

      const res = await as(testAdmin).delete(`/api/admin/test-users/${teacher.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 1 });

      for (const [Model, row] of [[User, teacher], [Course, lesson.course], [Unit, lesson.unit], [Story, lesson.story], [LessonPlan, lesson.plan],
        [Enrollment, enrollment], [LessonProgress, progress], [Coupon, coupon], [Affiliate, affiliate], [Order, order], [LessonComment, comment]]) {
        expect(await exists(Model, row.id)).toBe(false);
      }
      // the test student only lost their data on that course: the account is a separate test account that stays
      expect(await exists(User, testStudent.id)).toBe(true);
      for (const [Model, row] of [[User, realStudent], [User, realTeacher], [Course, otherCourse], [Enrollment, otherEnrollment]]) {
        expect(await exists(Model, row.id)).toBe(true);
      }
    });

    test('a test teacher whose course has real students is refused (409) and nothing is deleted', async () => {
      const teacher = await testAccount('teacher');
      const lesson = await courseWithLesson(teacher);
      const realStudent = await createUser('student', 'real-student');
      const { enrollment, progress } = await enrollWithProgress(realStudent, lesson);
      const testStudent = await testAccount('student');
      const testEnrollment = await Enrollment.create({ studentId: testStudent.id, courseId: lesson.course.id });
      try {
        const res = await as(testAdmin).delete(`/api/admin/test-users/${teacher.id}`);
        expect(res.status).toBe(409);
        expect(res.body.error).toEqual(expect.any(String));
        // ...and deleting everything is refused as a whole
        expect((await as(testAdmin).delete('/api/admin/test-users')).status).toBe(409);
        for (const [Model, row] of [[User, teacher], [User, testStudent], [User, realStudent], [Course, lesson.course], [Story, lesson.story],
          [Enrollment, enrollment], [Enrollment, testEnrollment], [LessonProgress, progress]]) {
          expect(await exists(Model, row.id)).toBe(true);
        }
        // a real buyer without an enrollment (an order) blocks as well
        await enrollment.destroy();
        const order = await Order.create({
          courseId: lesson.course.id, userId: realStudent.id, amount: 500, currency: 'usd', status: 'paid', provider: 'fake', providerSessionId: `jest-${randomUUID()}`
        });
        expect((await as(testAdmin).delete(`/api/admin/test-users/${teacher.id}`)).status).toBe(409);
        expect(await exists(Order, order.id)).toBe(true);
        await order.destroy();
      } finally {
        await Enrollment.destroy({ where: { courseId: lesson.course.id } });
      }
      // once the real data is gone it can be deleted
      expect((await as(testAdmin).delete(`/api/admin/test-users/${teacher.id}`)).body).toEqual({ deleted: 1 });
      expect(await exists(Course, lesson.course.id)).toBe(false);
      await User.destroy({ where: { id: testStudent.id } });
    });

    test('delete all removes every test account and no real one', async () => {
      const real = await createUser('teacher', 'real-teacher');
      const realCourse = await newCourse(real);
      const created = (await as(testAdmin).post('/api/admin/test-users', { role: 'student', count: 2, courseId: realCourse.id })).body;
      const teacher = await testAccount('teacher');
      const lesson = await courseWithLesson(teacher);
      const remaining = await User.count({ where: { isTestAccount: true } });
      expect(remaining).toBeGreaterThanOrEqual(3);

      const res = await as(testAdmin).delete('/api/admin/test-users');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: remaining });
      expect(await User.count({ where: { isTestAccount: true } })).toBe(0);
      expect(await Enrollment.count({ where: { studentId: created.map(c => c.user.id) } })).toBe(0);
      expect(await exists(Course, lesson.course.id)).toBe(false);
      expect(await exists(User, real.id)).toBe(true);
      expect(await exists(Course, realCourse.id)).toBe(true);
      expect((await as(testAdmin).delete('/api/admin/test-users')).body).toEqual({ deleted: 0 });
    });
  });

  test('token for a user removed from the database is rejected', async () => {
    const ghost = await createUser('student', 'ghost');
    const token = tokenFor(ghost);
    await User.destroy({ where: { id: ghost.id } });
    expect((await as({ token }).get('/api/auth/me')).status).toBe(401);
  });
});
