// GET /api/enrollments/:id/progress and DELETE /api/enrollments/:id/reset-progress, built on the lesson_* tables.
const { Unit, Story, Course, Vocabulary, Enrollment, LessonProgress, LessonAnswer, LessonReinforcement } = require('../src/models');
const { as, createUser, createWorld, createStory, standardBlocks, publishPlan, openLesson, visit, answer, planUrl } = require('./helpers/fixtures');

describe('Enrollment progress and reset (lesson-based)', () => {
  let world; let unit2; let storyA; let storyB; let storyC; let enrollmentId; let enrollment2Id;
  const progressUrl = id => `/api/enrollments/${id}/progress`;
  const resetUrl = id => `/api/enrollments/${id}/reset-progress`;
  const questionId = (lesson, key) => lesson.blocks.find(b => b.blockKey === key).questionId;

  async function publishedStory(label) {
    const content = await createStory(world, label);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    await publishPlan(world.teacher, content.story.id, blocks);
    return { ...content, keys };
  }

  /** Student opens the story, answers both questions (q1 wrong first), completes the narrative and the flashcards. */
  async function playThrough(student, { story, keys }, { complete = true } = {}) {
    const lesson = (await openLesson(student, story.id)).body;
    const pid = lesson.progress.id;
    for (const key of [keys.exp, keys.k1, keys.q1]) await visit(student, pid, key);
    await answer(student, pid, { blockKey: keys.q1, questionId: questionId(lesson, keys.q1), studentAnswer: 'En la escuela' });
    await answer(student, pid, { blockKey: keys.q1, questionId: questionId(lesson, keys.q1), studentAnswer: 'En la fiesta' });
    for (const key of [keys.k2, keys.q2]) await visit(student, pid, key);
    await answer(student, pid, { blockKey: keys.q2, questionId: questionId(lesson, keys.q2), studentAnswer: 'Sí' });
    if (complete) {
      expect((await as(student).post(`/api/lesson-plans/progress/${pid}/complete-narrative`)).status).toBe(200);
      expect((await as(student).put(`/api/lesson-plans/progress/${pid}/reinforcements/${keys.flash}`, { completed: true })).status).toBe(200);
    }
    return lesson;
  }

  beforeAll(async () => {
    world = await createWorld();
    enrollmentId = world.enrollments.student.id;
    enrollment2Id = world.enrollments.student2.id;
    // Course order: unit 0 [A (order 0), B (order 1)], unit 2 (order 1) [C]
    const a = await publishedStory('A');
    const b = await publishedStory('B');
    await b.story.update({ order: 1 });
    storyA = a; storyB = b;
    unit2 = await Unit.create({ courseId: world.course.id, title: 'Unidad 2', description: 'x', order: 1 });
    storyC = { story: await Story.create({ unitId: unit2.id, title: 'Historia C', text: 'Texto C.', order: 0 }) };
  });

  describe('GET progress', () => {
    test('requires authentication, the owner student or the teacher of the course', async () => {
      const url = progressUrl(enrollmentId);
      expect((await as(null).get(url)).status).toBe(401);
      expect((await as(world.student2).get(url)).status).toBe(403);
      expect((await as(world.outsider).get(url)).status).toBe(403);
      expect((await as(world.otherTeacher).get(url)).status).toBe(403);
      expect((await as(world.student).get(url)).status).toBe(200);
      expect((await as(world.teacher).get(url)).status).toBe(200);
      expect((await as(world.teacher).get(progressUrl(99999999))).status).toBe(404);
      expect((await as(world.student).get(progressUrl('abc'))).status).toBe(400);
    });

    test('lists every story of the course in unit/story order, with empty values for untouched stories', async () => {
      const res = await as(world.student2).get(progressUrl(enrollment2Id));
      expect(res.status).toBe(200);
      expect(res.body.map(e => e.storyId)).toEqual([storyA.story.id, storyB.story.id, storyC.story.id]);
      expect(res.body[0]).toEqual({
        storyId: storyA.story.id, storyTitle: storyA.story.title, unitId: world.unit.id, unitTitle: 'Unidad 1',
        revision: null, lastBlockKey: null, narrativeCompleted: false, completedAt: null,
        answers: { total: 0, correct: 0, attempts: 0 }, reinforcements: { total: 0, completed: 0 }
      });
      expect(res.body[2]).toMatchObject({ storyId: storyC.story.id, unitId: unit2.id, unitTitle: 'Unidad 2', revision: null });
    });

    test('reports revision, position, answers and reinforcements of the lesson progress', async () => {
      const student = await createUser('student', 'progress-student');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      await playThrough(student, storyA);
      await playThrough(student, storyB, { complete: false });

      for (const viewer of [student, world.teacher]) {
        const res = await as(viewer).get(progressUrl(enrollment.id));
        expect(res.status).toBe(200);
        const [a, b, c] = res.body;
        expect(a).toMatchObject({
          storyId: storyA.story.id, revision: 1, lastBlockKey: storyA.keys.q2, narrativeCompleted: true,
          answers: { total: 2, correct: 2, attempts: 3 }, reinforcements: { total: 1, completed: 1 }
        });
        expect(Number.isNaN(Date.parse(a.completedAt))).toBe(false);
        expect(b).toMatchObject({
          storyId: storyB.story.id, revision: 1, narrativeCompleted: false, completedAt: null,
          answers: { total: 2, correct: 2, attempts: 3 }, reinforcements: { total: 1, completed: 0 }
        });
        expect(c).toMatchObject({ storyId: storyC.story.id, revision: null, answers: { total: 0, correct: 0, attempts: 0 } });
      }
    });
  });

  describe('DELETE reset-progress', () => {
    test('only the owner student can reset; teachers, other students and unknown ids are rejected without deleting', async () => {
      const student = await createUser('student', 'reset-guard');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      await playThrough(student, storyA);

      expect((await as(null).delete(resetUrl(enrollment.id))).status).toBe(401);
      expect((await as(world.teacher).delete(resetUrl(enrollment.id))).status).toBe(403);
      expect((await as(world.student2).delete(resetUrl(enrollment.id))).status).toBe(403);
      expect((await as(student).delete(resetUrl(99999999))).status).toBe(404);
      expect((await as(student).delete(resetUrl('abc'))).status).toBe(400);
      expect(await LessonProgress.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
    });

    test('deletes progress, answers and reinforcements of that enrollment only, and answers with the counts', async () => {
      const student = await createUser('student', 'reset-owner');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      await playThrough(student, storyA);
      await playThrough(student, storyB);
      // Another student of the same course and the same student in a different course must stay intact.
      const other = await createUser('student', 'reset-other');
      const otherEnrollment = await Enrollment.create({ studentId: other.id, courseId: world.course.id });
      await playThrough(other, storyA);
      const secondCourse = await Course.create({ title: 'Otro curso', description: 'x', level: 'A1', teacherId: world.teacher.id });
      const secondUnit = await Unit.create({ courseId: secondCourse.id, title: 'U', description: 'x', order: 0 });
      const secondContent = await createStory({ ...world, unit: secondUnit }, 'Z');
      // vocabulary belongs to a unit, so the second course gets its own
      const secondVocab = await Vocabulary.create({ unitId: secondUnit.id, word: 'Hola', translation: 'Hello' });
      const sb = standardBlocks({ vocab: secondVocab, ...secondContent });
      await publishPlan(world.teacher, secondContent.story.id, sb.blocks);
      const secondEnrollment = await Enrollment.create({ studentId: student.id, courseId: secondCourse.id });
      await playThrough(student, { story: secondContent.story, keys: sb.keys });

      const ids = async enrollmentFilter => (await LessonProgress.findAll({ where: enrollmentFilter })).map(p => p.id);
      const counts = async enrollmentFilter => {
        const lessonProgressId = await ids(enrollmentFilter);
        return { progress: lessonProgressId.length, answers: await LessonAnswer.count({ where: { lessonProgressId } }),
          reinforcements: await LessonReinforcement.count({ where: { lessonProgressId } }) };
      };
      const beforeOther = await counts({ enrollmentId: otherEnrollment.id });
      const beforeSecond = await counts({ enrollmentId: secondEnrollment.id });
      expect(await counts({ enrollmentId: enrollment.id })).toEqual({ progress: 2, answers: 6, reinforcements: 2 });

      const res = await as(student).delete(resetUrl(enrollment.id));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: expect.any(String), deleted: { progress: 2, answers: 6, reinforcements: 2 } });
      expect(await counts({ enrollmentId: enrollment.id })).toEqual({ progress: 0, answers: 0, reinforcements: 0 });
      expect(await counts({ enrollmentId: otherEnrollment.id })).toEqual(beforeOther);
      expect(await counts({ enrollmentId: secondEnrollment.id })).toEqual(beforeSecond);
      expect(beforeOther.progress).toBe(1);
      expect(beforeSecond.progress).toBe(1);
      expect(await Enrollment.count({ where: { id: enrollment.id } })).toBe(1);

      // Idempotent: nothing left to delete.
      const again = await as(student).delete(resetUrl(enrollment.id));
      expect(again.status).toBe(200);
      expect(again.body.deleted).toEqual({ progress: 0, answers: 0, reinforcements: 0 });
    });

    test('after a reset the student starts over on the currently published revision', async () => {
      const student = await createUser('student', 'reset-revision');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      const content = await publishedStory('Rev');
      const started = (await openLesson(student, content.story.id)).body;
      expect(started.revision).toBe(1);

      const draft = (await as(world.teacher).get(`${planUrl(content.story.id)}/draft`)).body;
      await publishPlan(world.teacher, content.story.id, draft.blocks);
      expect((await openLesson(student, content.story.id)).body.revision).toBe(1); // pinned until reset

      expect((await as(student).delete(resetUrl(enrollment.id))).status).toBe(200);
      const restarted = (await openLesson(student, content.story.id)).body;
      expect(restarted.revision).toBe(2);
      expect(restarted.progress).toMatchObject({ lastBlockKey: null, narrativeCompleted: false, answers: [], reinforcements: [] });
      const progress = (await as(student).get(progressUrl(enrollment.id))).body.find(e => e.storyId === content.story.id);
      expect(progress.revision).toBe(2);
    });

    test('is transactional: a failure while deleting leaves answers, reinforcements and progress untouched', async () => {
      const student = await createUser('student', 'reset-tx');
      const enrollment = await Enrollment.create({ studentId: student.id, courseId: world.course.id });
      await playThrough(student, storyA);
      const before = {
        progress: await LessonProgress.count({ where: { enrollmentId: enrollment.id } }),
        answers: await LessonAnswer.count(), reinforcements: await LessonReinforcement.count()
      };

      const spy = jest.spyOn(LessonProgress, 'destroy').mockRejectedValueOnce(new Error('boom'));
      try {
        const res = await as(student).delete(resetUrl(enrollment.id));
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }

      expect({
        progress: await LessonProgress.count({ where: { enrollmentId: enrollment.id } }),
        answers: await LessonAnswer.count(), reinforcements: await LessonReinforcement.count()
      }).toEqual(before);
    });
  });
});
