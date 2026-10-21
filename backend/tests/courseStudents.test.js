// Teacher's students: list with progress, manual enrolment, removal, and the Hotmart CSV import (preview + apply).
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { User, Enrollment, LessonProgress, Story, PasswordToken } = require('../src/models');
const { clearOutbox } = require('../src/services/mailService');
const { as, createWorld, createUser, createStory, standardBlocks, publishPlan, openLesson } = require('./helpers/fixtures');
const { newCourse, upload, mailsTo, tokenFromMail } = require('./helpers/sales');

const read = name => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const unique = email => email.replace('@', `+${randomUUID().slice(0, 8)}@`);

describe('teacher access to course students', () => {
  let world; let course;
  beforeAll(async () => { world = await createWorld(); course = world.course; });
  beforeEach(() => clearOutbox());

  const urls = id => ({ list: `/api/courses/${id}/students`, preview: `/api/courses/${id}/students/import/preview`, apply: `/api/courses/${id}/students/import` });

  test('every endpoint needs the owner teacher: 401 anonymous, 403 student or other teacher, 404 unknown course', async () => {
    const { list, preview, apply } = urls(course.id);
    const enrollmentId = world.enrollments.student.id;
    const calls = [
      user => as(user).get(list),
      user => as(user).post(list, { email: 'x@jest.test' }),
      user => as(user).delete(`${list}/${enrollmentId}`),
      user => upload(user, preview, 'email\na@jest.test'),
      user => upload(user, apply, 'email\na@jest.test')
    ];
    for (const call of calls) {
      expect((await call(null)).status).toBe(401);
      expect((await call(world.student)).status).toBe(403);
      expect((await call(world.otherTeacher)).status).toBe(403);
    }
    expect((await as(world.teacher).get('/api/courses/99999999/students')).status).toBe(404);
    expect((await as(world.teacher).get('/api/courses/abc/students')).status).toBe(400);
    // nothing was written by the rejected calls
    expect(await Enrollment.count({ where: { id: enrollmentId } })).toBe(1);
    expect(await User.count({ where: { email: 'x@jest.test' } })).toBe(0);
    expect(await User.count({ where: { email: 'a@jest.test' } })).toBe(0);
  });

  test('the teacher guard only covers /:id/students: the course catalog stays readable without login', async () => {
    expect((await as(null).get('/api/courses')).status).toBe(200);
    expect((await as(null).get(`/api/courses/${course.id}`)).status).toBe(401); // content: owner or enrolled only
    expect((await as(world.teacher).get(`/api/courses/${course.id}`)).status).toBe(200);
  });

  describe('list and removal', () => {
    test('lists students with source and progress (completed lessons out of published lessons)', async () => {
      const own = await newCourse(world.teacher);
      const unit = await require('../src/models').Unit.create({ courseId: own.id, title: 'U', description: 'x', order: 0 });
      const stories = [await Story.create({ unitId: unit.id, title: 'A', text: 't', order: 0 }), await Story.create({ unitId: unit.id, title: 'B', text: 't', order: 1 })];
      const student = await createUser('student', 'progress');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: own.id, source: 'purchase' });
      const done = await LessonProgress.create({ enrollmentId: enrollment.id, storyId: stories[0].id, planId: await planFor(stories[0]), narrativeCompleted: true });
      expect(done.id).toBeTruthy();

      const res = await as(world.teacher).get(`/api/courses/${own.id}/students`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{
        enrollmentId: enrollment.id, user: { id: student.id, name: student.name, email: student.email }, source: 'purchase',
        enrolledAt: expect.any(String), progress: { completedStories: 1, totalStories: 1 } // B has no published lesson
      }]);
    });

    async function planFor(story) {
      const { LessonPlan } = require('../src/models');
      return (await LessonPlan.create({ storyId: story.id, revision: 1, status: 'published' })).id;
    }

    test('removing a student deletes the enrollment and their progress, only in that course', async () => {
      const own = await newCourse(world.teacher);
      const unit = await require('../src/models').Unit.create({ courseId: own.id, title: 'U', description: 'x', order: 0 });
      const story = await Story.create({ unitId: unit.id, title: 'A', text: 't', order: 0 });
      const student = await createUser('student', 'removable');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: own.id });
      await LessonProgress.create({ enrollmentId: enrollment.id, storyId: story.id, planId: await planFor(story), narrativeCompleted: true });

      // an enrollment id of another course cannot be removed through this course
      const foreign = await Enrollment.create({ studentId: student.id, courseId: world.foreignCourse.id });
      expect((await as(world.teacher).delete(`/api/courses/${own.id}/students/${foreign.id}`)).status).toBe(404);

      const res = await as(world.teacher).delete(`/api/courses/${own.id}/students/${enrollment.id}`);
      expect(res.status).toBe(204);
      expect(await Enrollment.count({ where: { id: enrollment.id } })).toBe(0);
      expect(await LessonProgress.count({ where: { enrollmentId: enrollment.id } })).toBe(0);
      expect(await Enrollment.count({ where: { id: foreign.id } })).toBe(1);
      expect((await as(world.teacher).delete(`/api/courses/${own.id}/students/${enrollment.id}`)).status).toBe(404);
    });
  });

  describe('manual enrolment', () => {
    test('creates the student, enrols with source manual, sends the invitation, and is idempotent', async () => {
      const email = `manual-${randomUUID()}@jest.test`;
      const url = `/api/courses/${course.id}/students`;

      const first = await as(world.teacher).post(url, { email: email.toUpperCase(), name: 'Manual Student' });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ user: { name: 'Manual Student', email }, source: 'manual', progress: { completedStories: 0 }, created: true, invited: true });
      const [mail] = mailsTo(email);
      expect(mail.subject).toMatch(/has moved your course to SpanishNow/);
      expect(mail.text).toContain(course.title);
      expect(mail.text).toContain('Your purchase on Hotmart is still valid');
      expect(mail.text).toContain('Set your password');

      const again = await as(world.teacher).post(url, { email });
      expect(again.status).toBe(200);
      expect(again.body.enrollmentId).toBe(first.body.enrollmentId);
      expect(again.body.created).toBe(false);
      expect(mailsTo(email)).toHaveLength(1);
      expect(await Enrollment.count({ where: { courseId: course.id, studentId: first.body.user.id } })).toBe(1);

      // the invitation link sets the password
      const reset = await as(null).post('/api/auth/reset-password', { token: tokenFromMail(mail), password: 'chosen-pass' });
      expect(reset.status).toBe(200);
    });

    test('an existing account gets access and a sign-in email; bad emails and teachers are rejected', async () => {
      const url = `/api/courses/${course.id}/students`;
      const existing = await createUser('student', 'already-here');
      const res = await as(world.teacher).post(url, { email: existing.email });
      expect(res.status).toBe(201);
      expect(mailsTo(existing.email)[0].text).not.toContain('Set your password');
      expect(mailsTo(existing.email)[0].text).toContain('Start learning');

      expect((await as(world.teacher).post(url, { email: 'nope' })).status).toBe(400);
      expect((await as(world.teacher).post(url, {})).status).toBe(400);
      expect((await as(world.teacher).post(url, { email: world.otherTeacher.email })).status).toBe(400);
    });
  });

  describe('Hotmart CSV import', () => {
    test('preview of a Spanish CSV (BOM, quoted commas, duplicates) classifies rows and writes nothing', async () => {
      const own = await newCourse(world.teacher);
      const existing = await createUser('student', 'hotmart-existing');
      const enrolled = await createUser('student', 'hotmart-enrolled');
      await Enrollment.create({ studentId: enrolled.id, courseId: own.id });
      const csv = read('hotmart-es.csv').toString('utf8')
        .replace('juan@example.com', existing.email).replace('luis@example.com', enrolled.email);
      const usersBefore = await User.count();

      const res = await upload(world.teacher, urls(own.id).preview, csv);
      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([
        { line: 2, name: 'María Pérez', email: 'maria.perez@example.com', status: 'new' },
        { line: 3, name: 'Gómez, Juan', email: existing.email, status: 'existing_user' },
        // line 4 is the same buyer as line 2 (case-insensitive): dropped as duplicate
        { line: 5, name: 'Sin Correo', email: '', status: 'invalid', reason: 'Missing email' },
        { line: 6, name: 'Roto', email: 'no-es-un-email', status: 'invalid', reason: 'Invalid email address' },
        { line: 7, name: 'Luis Soto', email: enrolled.email, status: 'already_enrolled' }
      ]);
      expect(res.body.summary).toEqual({ total: 5, new: 1, existingUser: 1, alreadyEnrolled: 1, invalid: 2, duplicates: 1 });
      expect(await User.count()).toBe(usersBefore);
      expect(await Enrollment.count({ where: { courseId: own.id } })).toBe(1);
      expect(getMailCount()).toBe(0);
    });

    const getMailCount = () => require('../src/services/mailService').getOutbox().length;

    test('a Portuguese CSV with ";" separator and latin text parses; apply creates students, enrolments and invitations', async () => {
      const own = await newCourse(world.teacher);
      const csv = read('hotmart-pt.csv');
      // make the emails unique per run
      const text = csv.toString('utf8').replace(/@example\.com/g, `-${randomUUID().slice(0, 6)}@example.com`);
      const emails = ['joao.silva', 'ana.costa', 'pedro'].map(local => new RegExp(`${local}-[a-z0-9]{6}@example\\.com`, 'i').exec(text)[0].toLowerCase());

      const preview = await upload(world.teacher, urls(own.id).preview, text);
      expect(preview.status).toBe(200);
      expect(preview.body.rows.map(r => [r.name, r.email, r.status])).toEqual([
        ['João Silva', emails[0], 'new'], ['Costa; Ana', emails[1], 'new'], ['Pedro', emails[2], 'new']
      ]);

      const applied = await upload(world.teacher, urls(own.id).apply, text, { sendInvites: true });
      expect(applied.status).toBe(200);
      expect(applied.body.summary).toMatchObject({ total: 3, new: 3, invalid: 0 });
      expect(applied.body.applied).toMatchObject({ users: 3, enrollments: 3, invites: { requested: 3, sent: 3, failed: 0, background: false } });

      const students = await as(world.teacher).get(urls(own.id).list);
      expect(students.body.map(s => s.user.email).sort()).toEqual([...emails].sort());
      expect(students.body.every(s => s.source === 'hotmart_import')).toBe(true);
      for (const email of emails) expect(mailsTo(email)).toHaveLength(1);
      expect(mailsTo(emails[0])[0].text).toContain('João Silva');

      // applying the same file again changes nothing and sends nothing
      clearOutbox();
      const repeat = await upload(world.teacher, urls(own.id).apply, text, { sendInvites: true });
      expect(repeat.body.summary).toMatchObject({ new: 0, alreadyEnrolled: 3 });
      expect(repeat.body.applied.enrollments).toBe(0);
      expect(getMailCount()).toBe(0);
      expect(await Enrollment.count({ where: { courseId: own.id } })).toBe(3);
    });

    test('without sendInvites nobody is emailed; existing accounts are enrolled with their own user', async () => {
      const own = await newCourse(world.teacher);
      const existing = await createUser('student', 'import-existing');
      const email = `fresh-${randomUUID()}@jest.test`;
      const res = await upload(world.teacher, urls(own.id).apply, `Name,Email\nOld,${existing.email}\nFresh,${email}\n`, { sendInvites: false });
      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ new: 1, existingUser: 1 });
      expect(getMailCount()).toBe(0);
      expect(await Enrollment.count({ where: { courseId: own.id, studentId: existing.id, source: 'hotmart_import' } })).toBe(1);
      const created = await User.findOne({ where: { email } });
      expect(created.role).toBe('student');
      expect(created.name).toBe('Fresh');
      expect(await PasswordToken.count({ where: { userId: created.id } })).toBe(0);
    });

    test('English headers, tab and Windows-1252 files are accepted; columns can come in any order', async () => {
      const own = await newCourse(world.teacher);
      const email = `en-${randomUUID()}@jest.test`;
      const csv = Buffer.from(`Buyer email;Buyer name\n${email};Zoë\n`, 'latin1'); // not valid UTF-8
      const res = await upload(world.teacher, urls(own.id).preview, csv);
      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([{ line: 2, name: 'Zoë', email, status: 'new' }]);
    });

    test('unusable files are refused: no email column, empty, wrong type, too many rows, too big, missing', async () => {
      const own = await newCourse(world.teacher);
      const { preview } = urls(own.id);
      const noEmail = await upload(world.teacher, preview, 'Name,Country\nA,B\n');
      expect(noEmail.status).toBe(400);
      expect(noEmail.body.error).toMatch(/No email column/);
      expect((await upload(world.teacher, preview, '')).status).toBe(400);

      const many = `Email\n${Array.from({ length: 5001 }, (_, i) => `u${i}@jest.test`).join('\n')}\n`;
      const tooMany = await upload(world.teacher, preview, many);
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.error).toMatch(/5000/);
      const limit = `Email\n${Array.from({ length: 5000 }, (_, i) => `u${i}@jest.test`).join('\n')}\n`;
      expect((await upload(world.teacher, preview, limit)).body.summary.total).toBe(5000);

      const big = await upload(world.teacher, preview, Buffer.alloc(2 * 1024 * 1024 + 10, 'a'));
      expect(big.status).toBe(413);

      const request = require('supertest');
      const { app } = require('./helpers/fixtures');
      const noFile = await request(app).post(preview).set('Authorization', `Bearer ${world.teacher.token}`);
      expect(noFile.status).toBe(400);
      const wrongType = await request(app).post(preview).set('Authorization', `Bearer ${world.teacher.token}`)
        .attach('file', Buffer.from('x'), { filename: 'photo.png', contentType: 'image/png' });
      expect(wrongType.status).toBe(400);
    });

    test('a teacher email in the file is invalid and never enrolled', async () => {
      const own = await newCourse(world.teacher);
      const res = await upload(world.teacher, urls(own.id).apply, `Email\n${world.otherTeacher.email}\n`, { sendInvites: true });
      expect(res.body.rows[0]).toMatchObject({ status: 'invalid', reason: 'This email belongs to a teacher account' });
      expect(await Enrollment.count({ where: { courseId: own.id } })).toBe(0);
    });
  });
});
