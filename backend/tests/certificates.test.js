// Certificate of completion: eligibility, idempotent issue, public verification and the PDF.
const request = require('supertest');
const { app, as, createWorld, createStory, createUser } = require('./helpers/fixtures');
const certificateService = require('../src/services/certificateService');
const { LessonPlan, LessonProgress, Story, Unit, Enrollment, Certificate, UnitQuiz } = require('../src/models');

const quizBody = (extra = {}) => ({ title: 'Quiz', passingScore: 70, isPublished: true, questions: [{ prompt: 'P', options: ['a', 'b'], correctIndex: 0 }, { prompt: 'Q', options: ['a', 'b'], correctIndex: 1 }], ...extra });
const CODE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

/** A story with a published lesson (what the certificate requires) in the world's unit, or a given one. */
async function lessonStory(world, unit = world.unit) {
  const story = await Story.create({ unitId: unit.id, title: 'Lección', text: 'Texto.', order: 0 });
  const plan = await LessonPlan.create({ storyId: story.id, revision: 1, status: 'published' });
  return { story, plan };
}
const complete = (enrollment, { story, plan }) => LessonProgress.create({ enrollmentId: enrollment.id, storyId: story.id, planId: plan.id, narrativeCompleted: true });
const progressOf = (user, enrollment) => as(user).get(`/api/enrollments/${enrollment.id}/progress`).then(r => r.body.certificate);
const issue = (user, enrollment, body) => as(user).post(`/api/enrollments/${enrollment.id}/certificate`, body);

describe('certificates', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  describe('eligibility', () => {
    test('needs every story with a published lesson completed and every published quiz passed; drafts and unpublished lessons do not count', async () => {
      const student = await createUser('student', 'cert-eligibility');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      const lessonA = await lessonStory(world);
      const lessonB = await lessonStory(world);
      await Story.create({ unitId: world.unit.id, title: 'Sin lección', text: 'x', order: 9 }); // no plan: not required
      const draftOnly = await Story.create({ unitId: world.unit.id, title: 'Borrador', text: 'x', order: 10 });
      await LessonPlan.create({ storyId: draftOnly.id, revision: 1, status: 'draft' }); // draft: not required

      expect(await progressOf(student, enrollment)).toEqual({ eligible: false, code: null, missing: { stories: 2, quizzes: 0 } });
      await complete(enrollment, lessonA);
      expect(await progressOf(student, enrollment)).toEqual({ eligible: false, code: null, missing: { stories: 1, quizzes: 0 } });

      const quizUrl = `/api/units/${world.unit.id}/quiz`;
      await as(world.teacher).put(quizUrl, quizBody({ isPublished: false })); // a draft quiz is not required
      expect((await progressOf(student, enrollment)).missing).toEqual({ stories: 1, quizzes: 0 });
      await as(world.teacher).put(quizUrl, quizBody());
      expect((await progressOf(student, enrollment)).missing).toEqual({ stories: 1, quizzes: 1 });

      await complete(enrollment, lessonB);
      await as(student).post(`${quizUrl}/attempts`, { answers: [0, 0] }); // 50 < 70
      expect(await progressOf(student, enrollment)).toEqual({ eligible: false, code: null, missing: { stories: 0, quizzes: 1 } });
      await as(student).post(`${quizUrl}/attempts`, { answers: [0, 1] });
      expect(await progressOf(student, enrollment)).toEqual({ eligible: true, code: null, missing: { stories: 0, quizzes: 0 } });
    });

    test('a course with nothing to complete is never eligible', async () => {
      const empty = await createWorld();
      const completion = await certificateService.completionOf(empty.enrollments.student);
      expect(completion).toMatchObject({ eligible: false, missing: { stories: 0, quizzes: 0 } });
      expect((await issue(empty.student, empty.enrollments.student)).status).toBe(409);
    });
  });

  describe('issuing', () => {
    let student; let enrollment;
    beforeAll(async () => {
      student = await createUser('student', 'cert-issue');
      enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
    });

    test('409 with what is missing while not eligible; only the owner student can ask (401/403/404/400)', async () => {
      const lesson = await lessonStory(world);
      const res = await issue(student, enrollment);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: expect.any(String), missing: expect.objectContaining({ stories: expect.any(Number), quizzes: expect.any(Number) }) });
      expect(await Certificate.count({ where: { enrollmentId: enrollment.id } })).toBe(0);

      expect((await issue(null, enrollment)).status).toBe(401);
      expect((await issue(world.student2, enrollment)).status).toBe(403);
      expect((await issue(world.teacher, enrollment)).status).toBe(403);
      expect((await as(student).post('/api/enrollments/99999999/certificate', {})).status).toBe(404);
      expect((await as(student).post('/api/enrollments/abc/certificate', {})).status).toBe(400);
      await LessonProgress.destroy({ where: { storyId: lesson.story.id } });
    });

    test('issues with the account name by default, a unique readable code and copies of the names; asking again returns the same one', async () => {
      // complete everything this course requires so far
      const stories = await Story.findAll({ attributes: ['id'], include: [{ model: Unit, as: 'unit', attributes: [], where: { courseId: world.course.id } }] });
      for (const s of stories) {
        const plan = await LessonPlan.findOne({ where: { storyId: s.id, status: 'published' } });
        if (plan) await LessonProgress.findOrCreate({ where: { enrollmentId: enrollment.id, storyId: s.id }, defaults: { planId: plan.id, narrativeCompleted: true } });
      }
      const quiz = await UnitQuiz.findOne({ where: { unitId: world.unit.id, isPublished: true } });
      if (quiz) await as(student).post(`/api/units/${world.unit.id}/quiz/attempts`, { answers: [0, 1] });
      expect((await progressOf(student, enrollment)).eligible).toBe(true);

      const first = await issue(student, enrollment, {});
      expect(first.status).toBe(201);
      expect(first.body).toEqual({ code: expect.stringMatching(CODE), studentName: student.name, courseTitle: world.course.title, teacherName: world.teacher.name, issuedAt: expect.any(String) });

      const again = await issue(student, enrollment, {});
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await Certificate.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
      expect(await progressOf(student, enrollment)).toMatchObject({ eligible: true, code: first.body.code });

      // names are copies: renaming the course afterwards does not change the issued certificate
      await world.course.update({ title: 'Título nuevo' });
      expect((await as(null).get(`/api/public/certificates/${first.body.code}`)).body.courseTitle).toBe(first.body.courseTitle);
    });

    test('name: printed as given (trimmed), up to 100 characters, and a later name corrects it without changing the code', async () => {
      const other = await createUser('student', 'cert-name');
      const e = await Enrollment.create({ studentId: other.id, courseId: world.course.id });
      const stories = await Story.findAll({ attributes: ['id'], include: [{ model: Unit, as: 'unit', attributes: [], where: { courseId: world.course.id } }] });
      for (const s of stories) {
        const plan = await LessonPlan.findOne({ where: { storyId: s.id, status: 'published' } });
        if (plan) await LessonProgress.create({ enrollmentId: e.id, storyId: s.id, planId: plan.id, narrativeCompleted: true });
      }
      await as(other).post(`/api/units/${world.unit.id}/quiz/attempts`, { answers: [0, 1] });

      expect((await issue(other, e, { name: 'x'.repeat(101) })).status).toBe(400);
      expect((await issue(other, e, { name: 42 })).status).toBe(400);
      expect(await Certificate.count({ where: { enrollmentId: e.id } })).toBe(0);
      const created = await issue(other, e, { name: '  María   Pérez  ' });
      expect([created.status, created.body.studentName]).toEqual([201, 'María Pérez']);
      const corrected = await issue(other, e, { name: 'María del Carmen Pérez' });
      expect(corrected.status).toBe(200);
      expect(corrected.body).toMatchObject({ code: created.body.code, studentName: 'María del Carmen Pérez' });
      expect((await issue(other, e, {})).body.studentName).toBe('María del Carmen Pérez'); // no name: unchanged
    });

    test('resetting the progress keeps the certificate; removing the access deletes it', async () => {
      const code = (await issue(student, enrollment, {})).body.code;
      expect((await as(student).delete(`/api/enrollments/${enrollment.id}/reset-progress`)).status).toBe(200);
      expect((await as(null).get(`/api/public/certificates/${code}`)).status).toBe(200);
      expect((await issue(student, enrollment, {})).body.code).toBe(code); // already issued: the same one even if no longer eligible
      expect((await as(world.teacher).delete(`/api/courses/${world.course.id}/students/${enrollment.id}`)).status).toBe(204);
      expect((await as(null).get(`/api/public/certificates/${code}`)).status).toBe(404);
      expect(await Certificate.count({ where: { code } })).toBe(0);
    });
  });

  describe('public verification and PDF', () => {
    let certificate;
    beforeAll(async () => {
      const student = await createUser('student', 'cert-public');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      certificate = await Certificate.create({
        enrollmentId: enrollment.id, code: certificateService.generateCode(), studentName: 'María Pérez', courseTitle: 'Learn Spanish with a Short Film (PART 1)',
        teacherName: 'Solange', issuedAt: new Date('2026-10-21T15:00:00Z')
      });
    });

    test('GET /public/certificates/:code needs no login, ignores case and hyphens, and returns only the public data', async () => {
      const res = await request(app).get(`/api/public/certificates/${certificate.code}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: certificate.code, studentName: 'María Pérez', courseTitle: 'Learn Spanish with a Short Film (PART 1)', teacherName: 'Solange', issuedAt: '2026-10-21T15:00:00.000Z' });
      const sloppy = certificate.code.toLowerCase().replace(/-/g, ' ');
      expect((await request(app).get(`/api/public/certificates/${encodeURIComponent(sloppy)}`)).body.code).toBe(certificate.code);
      for (const bad of ['ZZZZ-ZZZZ-ZZZZ', 'abc', '0000-0000-0000', 'K7QM-X2PD-9TNA-EXTRA', '%27%20OR%201=1']) {
        expect((await request(app).get(`/api/public/certificates/${bad}`)).status).toBe(404);
        expect((await request(app).get(`/api/public/certificates/${bad}/pdf`)).status).toBe(404);
      }
    });

    test('GET /public/certificates/:code/pdf returns a PDF (A4 landscape) without a token', async () => {
      const res = await request(app).get(`/api/public/certificates/${certificate.code}/pdf`).buffer(true).parse((r, cb) => {
        const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain(`certificate-${certificate.code}.pdf`);
      expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(res.body.subarray(-10).toString('latin1')).toContain('%%EOF');
      expect(Number(res.headers['content-length'])).toBe(res.body.length);
    });

    test('the PDF is one A4 landscape page with the data, the verification URL, and keeps Spanish accents', async () => {
      const pdf = await certificateService.renderPdf(certificate, { compress: false });
      const text = pdf.toString('latin1');
      expect(text).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
      expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
      expect(text).toContain('/WinAnsiEncoding');
      // text is stored as hex strings in WinAnsi (= Latin-1 for these letters)
      const shown = [...text.matchAll(/\[([^\]]*)\] TJ/g)].map(m => [...m[1].matchAll(/<([0-9a-f]*)>/g)].map(h => Buffer.from(h[1], 'hex').toString('latin1')).join('')).join('\n');
      expect(shown).toContain('María Pérez');
      expect(shown).toContain('Certificate of Completion');
      expect(shown).toContain('Learn Spanish with a Short Film (PART 1)');
      expect(shown).toContain('taught by Solange');
      expect(shown).toContain('October 21, 2026');
      expect(shown).toContain(certificate.code);
      expect(shown).toContain(`http://localhost:4200/certificates/${certificate.code}`);
      expect(text).toMatch(/0\.23921568627450981 0\.0784313725490196 0\.12549019607843137 scn/); // wine #3d1420
    });

    test('characters outside Windows-1252 lose their marks or become "?" instead of breaking the file', async () => {
      expect(certificateService.pdfSafe('María Pérez Ñandú ¿Qué?')).toBe('María Pérez Ñandú ¿Qué?');
      expect(certificateService.pdfSafe('Łukasz Žižek')).toBe('Lukasz Žižek');
      expect(certificateService.pdfSafe('李雷')).toBe('??');
      const pdf = await certificateService.renderPdf({ ...certificate.toJSON(), studentName: '李雷 Łukasz', courseTitle: 'x'.repeat(300) });
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  test('codes are random, unambiguous and 14 characters (fits the column)', () => {
    const codes = new Set(Array.from({ length: 500 }, () => certificateService.generateCode()));
    expect(codes.size).toBe(500);
    for (const code of codes) { expect(code).toMatch(CODE); expect(code.length).toBeLessThanOrEqual(16); }
    expect(certificateService.normalizeCode('k7qm x2pd.9tna')).toBe('K7QM-X2PD-9TNA');
    expect(certificateService.normalizeCode('K7QM-X2PD-9TN0')).toBeNull(); // 0 is not in the alphabet
  });
});
