// Unit quizzes: teacher CRUD, the student never sees the answers before submitting, scoring and best attempt.
const { as, createWorld, createUser } = require('./helpers/fixtures');
const { Unit, Enrollment, UnitQuizAttempt, UnitQuiz } = require('../src/models');
const { grade, parseQuizPayload } = require('../src/services/quizService');

const question = (n, extra = {}) => ({ prompt: `Pregunta ${n}`, options: ['Uno', 'Dos', 'Tres'], correctIndex: n % 3, explanation: `Porque ${n}`, ...extra });
const quizBody = (extra = {}) => ({ title: 'Quiz 1', passingScore: 70, isPublished: true, questions: [question(0), question(1), question(2), question(3)], ...extra });

describe('unit quiz', () => {
  let world; let url; let studentUrl; let attemptsUrl;

  beforeAll(async () => {
    world = await createWorld();
    url = `/api/units/${world.unit.id}/quiz`;
    studentUrl = `${url}/student`;
    attemptsUrl = `${url}/attempts`;
  });

  describe('teacher', () => {
    test('GET is 404 without a quiz; only the owner teacher can read, write or delete (401/403 otherwise)', async () => {
      expect((await as(world.teacher).get(url)).status).toBe(404);
      expect((await as(null).get(url)).status).toBe(401);
      expect((await as(world.student).get(url)).status).toBe(403);
      expect((await as(world.otherTeacher).get(url)).status).toBe(403);
      expect((await as(world.otherTeacher).put(url, quizBody())).status).toBe(403);
      expect((await as(world.student).put(url, quizBody())).status).toBe(403);
      expect((await as(world.otherTeacher).delete(url)).status).toBe(403);
      expect((await as(world.teacher).get('/api/units/99999999/quiz')).status).toBe(404);
      expect((await as(world.teacher).get('/api/units/abc/quiz')).status).toBe(404);
    });

    test('PUT validates: 1-50 questions, 2-6 non-empty options, correctIndex in range, passingScore 1-100', async () => {
      const bad = async (body, pattern) => {
        const res = await as(world.teacher).put(url, body);
        expect([res.status, res.body.error]).toEqual([400, expect.stringMatching(pattern)]);
      };
      await bad(quizBody({ questions: [] }), /between 1 and 50/);
      await bad(quizBody({ questions: undefined }), /between 1 and 50/);
      await bad(quizBody({ questions: Array.from({ length: 51 }, (_, i) => question(i)) }), /between 1 and 50/);
      await bad(quizBody({ questions: [question(0, { options: ['Solo una'], correctIndex: 0 })] }), /options/);
      await bad(quizBody({ questions: [question(0, { options: ['1', '2', '3', '4', '5', '6', '7'] })] }), /options/);
      await bad(quizBody({ questions: [question(0, { options: ['Uno', '  '] })] }), /options cannot be empty/);
      await bad(quizBody({ questions: [question(0, { correctIndex: 3 })] }), /correctIndex/);
      await bad(quizBody({ questions: [question(0, { correctIndex: -1 })] }), /correctIndex/);
      await bad(quizBody({ questions: [question(0, { correctIndex: '1' })] }), /correctIndex/);
      await bad(quizBody({ questions: [question(0, { prompt: ' ' })] }), /prompt/);
      await bad(quizBody({ passingScore: 0 }), /passingScore/);
      await bad(quizBody({ passingScore: 101 }), /passingScore/);
      await bad(quizBody({ passingScore: 70.5 }), /passingScore/);
      await bad(quizBody({ isPublished: 'yes' }), /isPublished/);
      await bad(quizBody({ title: '' }), /title/);
      await bad(quizBody({ questions: [{ ...question(0), id: 999999 }] }), /does not belong/);
      expect((await as(world.teacher).get(url)).status).toBe(404); // nothing was saved
      expect(parseQuizPayload({ questions: [question(0)] }).value).toMatchObject({ title: 'Quiz', passingScore: 70, isPublished: false });
    });

    test('PUT creates, then replaces syncing questions by id; GET returns the full quiz with the answers; DELETE removes it', async () => {
      const created = await as(world.teacher).put(url, quizBody());
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ unitId: world.unit.id, title: 'Quiz 1', passingScore: 70, isPublished: true });
      expect(created.body.questions.map(q => q.prompt)).toEqual(['Pregunta 0', 'Pregunta 1', 'Pregunta 2', 'Pregunta 3']);
      expect(created.body.questions[1]).toEqual({ id: expect.any(Number), prompt: 'Pregunta 1', options: ['Uno', 'Dos', 'Tres'], correctIndex: 1, explanation: 'Porque 1' });
      const ids = created.body.questions.map(q => q.id);

      // keep question 2 (edited, now first), drop 0, 1 and 3, add a new one
      const replaced = await as(world.teacher).put(url, quizBody({
        title: 'Quiz editado', passingScore: 50, isPublished: false,
        questions: [{ ...created.body.questions[2], prompt: 'Editada', explanation: null }, question(5, { explanation: undefined })]
      }));
      expect(replaced.status).toBe(200);
      expect(replaced.body.id).toBe(created.body.id);
      expect(replaced.body).toMatchObject({ title: 'Quiz editado', passingScore: 50, isPublished: false });
      expect(replaced.body.questions).toHaveLength(2);
      expect(replaced.body.questions[0]).toMatchObject({ id: ids[2], prompt: 'Editada', explanation: null });
      expect(replaced.body.questions[1].id).not.toBeUndefined();
      expect(ids).not.toContain(replaced.body.questions[1].id);
      expect(replaced.body.questions[1].explanation).toBeNull();
      expect(await UnitQuiz.count({ where: { unitId: world.unit.id } })).toBe(1);

      expect((await as(world.teacher).get(url)).body).toEqual(replaced.body);
      expect((await as(world.teacher).delete(url)).status).toBe(204);
      expect((await as(world.teacher).get(url)).status).toBe(404);
      expect((await as(world.teacher).delete(url)).status).toBe(404);
    });

    test('a question id from another quiz is refused and nothing changes', async () => {
      const otherUnit = await Unit.create({ courseId: world.course.id, title: 'Unidad 2', description: 'x', order: 1 });
      const other = await as(world.teacher).put(`/api/units/${otherUnit.id}/quiz`, quizBody());
      const mine = await as(world.teacher).put(url, quizBody());
      const res = await as(world.teacher).put(url, quizBody({ title: 'Cambiado', questions: [{ ...question(0), id: other.body.questions[0].id }] }));
      expect(res.status).toBe(400);
      expect((await as(world.teacher).get(url)).body).toEqual(mine.body);
      await as(world.teacher).delete(`/api/units/${otherUnit.id}/quiz`);
      await as(world.teacher).delete(url);
    });
  });

  describe('student', () => {
    let quiz;
    beforeAll(async () => {
      quiz = (await as(world.teacher).put(url, quizBody())).body; // correct answers: 0,1,2,0
    });

    test('the student quiz never carries correctIndex or explanation', async () => {
      const res = await as(world.student).get(studentUrl);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: quiz.id, title: 'Quiz 1', passingScore: 70, bestAttempt: null,
        questions: quiz.questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options }))
      });
      expect(JSON.stringify(res.body)).not.toMatch(/correctIndex|explanation|Porque/);
    });

    test('access: 401 anonymous, 403 outsiders and other teachers, 404 when unpublished or missing', async () => {
      expect((await as(null).get(studentUrl)).status).toBe(401);
      expect((await as(world.outsider).get(studentUrl)).status).toBe(403);
      expect((await as(world.otherTeacher).get(studentUrl)).status).toBe(403);
      expect((await as(world.outsider).post(attemptsUrl, { answers: [0, 1, 2, 0] })).status).toBe(403);
      expect((await as(world.teacher).post(attemptsUrl, { answers: [0, 1, 2, 0] })).status).toBe(403); // teachers do not take quizzes
      expect((await as(world.student).get('/api/units/99999999/quiz/student')).status).toBe(404);

      await as(world.teacher).put(url, quizBody({ isPublished: false, questions: quiz.questions }));
      expect((await as(world.student).get(studentUrl)).status).toBe(404);
      expect((await as(world.student).post(attemptsUrl, { answers: [0, 1, 2, 0] })).status).toBe(404);
      await as(world.teacher).put(url, quizBody({ questions: quiz.questions }));
    });

    test('scoring, results with the answers after submitting, unlimited attempts and best score', async () => {
      const student = await createUser('student', 'quiz-taker');
      await Enrollment.create({ studentId: student.id, courseId: world.course.id });

      const bad = await as(student).post(attemptsUrl, { answers: [2, 2, 0, 1] }); // 0 of 4 correct
      expect(bad.status).toBe(201);
      expect(bad.body).toMatchObject({ score: 0, passed: false, bestScore: 0 });
      expect(bad.body.results).toEqual(quiz.questions.map((q, i) => ({ questionId: q.id, correct: false, correctIndex: i % 3, explanation: `Porque ${i}` })));

      const partial = await as(student).post(attemptsUrl, { answers: [0, 1, 0, 1] }); // 2 of 4 = 50
      expect(partial.body).toMatchObject({ score: 50, passed: false, bestScore: 50 });
      expect(partial.body.results.map(r => r.correct)).toEqual([true, true, false, false]);

      const pass = await as(student).post(attemptsUrl, { answers: [0, 1, 2, 1] }); // 3 of 4 = 75
      expect(pass.body).toMatchObject({ score: 75, passed: true, bestScore: 75 });

      const worse = await as(student).post(attemptsUrl, { answers: [1, 1, 1, 1] }); // 1 of 4 = 25: the best stays
      expect(worse.body).toMatchObject({ score: 25, passed: false, bestScore: 75 });

      expect((await as(student).get(studentUrl)).body.bestAttempt).toEqual({ score: 75, passed: true });
      expect(await UnitQuizAttempt.count({ where: { quizId: quiz.id } })).toBeGreaterThanOrEqual(4);
      // the best attempt follows the passing score the teacher has now
      await as(world.teacher).put(url, quizBody({ passingScore: 90, questions: quiz.questions }));
      expect((await as(student).get(studentUrl)).body.bestAttempt).toEqual({ score: 75, passed: false });
      await as(world.teacher).put(url, quizBody({ questions: quiz.questions }));
    });

    test('validates the answers: one per question, valid option indexes (null = blank)', async () => {
      const post = answers => as(world.student2).post(attemptsUrl, { answers });
      for (const answers of [[0, 1, 2], [0, 1, 2, 0, 0], [0, 1, 2, 3], [0, 1, 2, -1], [0, 1, 2, '0'], [0, 1, 2, 1.5]]) {
        expect((await post(answers)).status).toBe(400);
      }
      expect((await as(world.student2).post(attemptsUrl, {})).status).toBe(400);
      expect((await as(world.student2).post(attemptsUrl, { answers: 'x' })).status).toBe(400);
      const blank = await post([0, null, null, null]);
      expect(blank.status).toBe(201);
      expect(blank.body.score).toBe(25);
    });

    test('grade() rounds the percentage', () => {
      const qs = [1, 2, 3].map(id => ({ id, correctIndex: 0, explanation: null, options: ['a', 'b'] }));
      expect(grade(qs, [0, 1, 1]).score).toBe(33);
      expect(grade(qs, [0, 0, 1]).score).toBe(67);
      expect(grade([], []).score).toBe(0);
    });

    test('removing access or resetting progress deletes the attempts', async () => {
      const student = await createUser('student', 'quiz-reset');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      await as(student).post(attemptsUrl, { answers: [0, 1, 2, 0] });
      expect(await UnitQuizAttempt.count({ where: { enrollmentId: enrollment.id } })).toBe(1);

      const reset = await as(student).delete(`/api/enrollments/${enrollment.id}/reset-progress`);
      expect(reset.status).toBe(200);
      expect(reset.body.deleted.quizAttempts).toBe(1);
      expect(await UnitQuizAttempt.count({ where: { enrollmentId: enrollment.id } })).toBe(0);
      expect((await as(student).get(studentUrl)).body.bestAttempt).toBeNull();

      await as(student).post(attemptsUrl, { answers: [0, 1, 2, 0] });
      const removed = await as(world.teacher).delete(`/api/courses/${world.course.id}/students/${enrollment.id}`);
      expect(removed.status).toBe(204);
      expect(await UnitQuizAttempt.count({ where: { enrollmentId: enrollment.id } })).toBe(0);
    });
  });
});
