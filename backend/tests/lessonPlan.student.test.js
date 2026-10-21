// Student journey: pinned revision, resume, retries, reinforcements and per-story scope.
const { LessonReinforcement, LessonAnswer, LessonProgress } = require('../src/models');
const { as, createWorld, createStory, standardBlocks, planUrl, publishPlan, openLesson, visit, answer } = require('./helpers/fixtures');

describe('TPRS lesson plans: student journey', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  async function publishedStory(label) {
    const content = await createStory(world, label);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    const plan = await publishPlan(world.teacher, content.story.id, blocks);
    return { ...content, keys, plan };
  }

  const questionId = (lesson, key) => lesson.blocks.find(b => b.blockKey === key).questionId;
  async function visitAll(student, progressId, keys) {
    for (const key of keys) {
      const res = await visit(student, progressId, key);
      if (res.status !== 200) throw new Error(`cannot visit ${key}: ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  describe('fixed revision', () => {
    test('a student who started revision 1 keeps it after revision 2 is published with another order; a new student gets revision 2', async () => {
      const { story, keys, plan } = await publishedStory();
      const started = (await openLesson(world.student, story.id)).body;
      expect(started.revision).toBe(1);
      expect(started.blocks.map(b => b.blockKey)).toEqual([keys.exp, keys.k1, keys.q1, keys.k2, keys.q2, keys.full, keys.flash]);

      // Teacher publishes revision 2: second scene first, and a changed text.
      const draft = (await as(world.teacher).get(`${planUrl(story.id)}/draft`)).body;
      expect(draft.revision).toBe(2);
      const byKey = Object.fromEntries(draft.blocks.map(b => [b.blockKey, b]));
      byKey[keys.k2] = { ...byKey[keys.k2], text: 'María ve a Juan (revisión 2).' };
      const newOrder = [keys.exp, keys.k2, keys.q2, keys.k1, keys.q1, keys.full, keys.flash];
      const second = await publishPlan(world.teacher, story.id, newOrder.map(k => byKey[k]));
      expect(second.revision).toBe(2);
      expect(second.id).not.toBe(plan.id);

      const again = (await openLesson(world.student, story.id)).body;
      expect(again.id).toBe(started.id); // same planId
      expect(again.revision).toBe(1);
      expect(again.progress.id).toBe(started.progress.id);
      expect(again.blocks.map(b => b.blockKey)).toEqual(started.blocks.map(b => b.blockKey));
      expect(again.story.fullStoryText).toBe(started.story.fullStoryText);

      const fresh = (await openLesson(world.student2, story.id)).body;
      expect(fresh.id).toBe(second.id);
      expect(fresh.revision).toBe(2);
      expect(fresh.blocks.map(b => b.blockKey)).toEqual(newOrder);
      expect(fresh.story.fullStoryText).toContain('(revisión 2)');
    });

    test('the student can still answer in the pinned revision after a newer one is published', async () => {
      const { story, keys } = await publishedStory();
      const started = (await openLesson(world.student, story.id)).body;
      await visitAll(world.student, started.progress.id, [keys.exp, keys.k1, keys.q1]);

      const draft = (await as(world.teacher).get(`${planUrl(story.id)}/draft`)).body;
      await publishPlan(world.teacher, story.id, draft.blocks.filter(b => b.blockKey !== keys.flash));

      const res = await answer(world.student, started.progress.id, { blockKey: keys.q1, questionId: questionId(started, keys.q1), studentAnswer: 'En la fiesta' });
      expect(res.status).toBe(200);
      expect(res.body.isCorrect).toBe(true);
    });
  });

  describe('resume', () => {
    test('stores the last visited block and returns it when the student comes back', async () => {
      const { story, keys } = await publishedStory();
      const first = (await openLesson(world.student, story.id)).body;
      expect(first.progress.lastBlockKey).toBeNull();

      await visitAll(world.student, first.progress.id, [keys.exp, keys.k1, keys.q1, keys.k2]);

      const back = (await openLesson(world.student, story.id)).body;
      expect(back.progress.id).toBe(first.progress.id);
      expect(back.progress.lastBlockKey).toBe(keys.k2);
      // Moving backwards (re-reading) is allowed and is remembered too.
      expect((await visit(world.student, first.progress.id, keys.k1)).status).toBe(200);
      expect((await openLesson(world.student, story.id)).body.progress.lastBlockKey).toBe(keys.k1);
      // Another student's resume point is independent.
      expect((await openLesson(world.student2, story.id)).body.progress.lastBlockKey).toBeNull();
    });

    test('rejects jumping ahead, unknown blocks and blocks of other stories', async () => {
      const a = await publishedStory();
      const b = await publishedStory();
      const lesson = (await openLesson(world.student, a.story.id)).body;

      expect((await visit(world.student, lesson.progress.id, a.keys.q2)).status).toBe(409);
      expect((await visit(world.student, lesson.progress.id, '22222222-2222-4222-8222-222222222222')).status).toBe(400);
      expect((await visit(world.student, lesson.progress.id, b.keys.exp)).status).toBe(400);
      expect((await openLesson(world.student, a.story.id)).body.progress.lastBlockKey).toBeNull();
    });
  });

  describe('questions: errors give context and never block progress', () => {
    test('a wrong answer returns the keyframe context, allows retrying and continuing; the retry is recorded', async () => {
      const { story, keys } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      await visitAll(world.student, lesson.progress.id, [keys.exp, keys.k1, keys.q1]);
      const qid = questionId(lesson, keys.q1);

      const wrong = await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: qid, studentAnswer: 'En la escuela' });
      expect(wrong.status).toBe(200);
      expect(wrong.body).toMatchObject({ isCorrect: false, attempt: 1, canRetry: true, canContinue: true });
      expect(wrong.body.context).toEqual({ blockKey: keys.k1, text: 'María va a una fiesta.' });

      // Not blocked: the student can move on without answering correctly...
      expect((await visit(world.student, lesson.progress.id, keys.k2)).status).toBe(200);
      // ...and also come back and retry.
      expect((await visit(world.student, lesson.progress.id, keys.q1)).status).toBe(200);
      const retry = await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: qid, studentAnswer: '  en la FIESTA ' });
      expect(retry.body).toMatchObject({ isCorrect: true, attempt: 2, context: null });

      const reopened = (await openLesson(world.student, story.id)).body;
      expect(reopened.progress.answers.map(a => [a.attempt, a.isCorrect])).toEqual([[1, false], [2, true]]);
    });

    test('the narrative can be completed with wrong answers (no 100% requirement), but not before the last narrative block', async () => {
      const { story, keys } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      const complete = () => as(world.student).post(`/api/lesson-plans/progress/${lesson.progress.id}/complete-narrative`);
      await visitAll(world.student, lesson.progress.id, [keys.exp, keys.k1, keys.q1]);

      expect((await complete()).status).toBe(409);

      expect((await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: questionId(lesson, keys.q1), studentAnswer: 'En la escuela' })).body.isCorrect).toBe(false);
      await visitAll(world.student, lesson.progress.id, [keys.k2, keys.q2]);
      expect((await answer(world.student, lesson.progress.id, { blockKey: keys.q2, questionId: questionId(lesson, keys.q2), studentAnswer: 'No' })).body.isCorrect).toBe(false);

      const done = await complete();
      expect(done.status).toBe(200);
      expect(done.body.narrativeCompleted).toBe(true);
      expect((await openLesson(world.student, story.id)).body.progress.narrativeCompleted).toBe(true);
    });

    test('rejects empty, oversized or non-string answers', async () => {
      const { story, keys } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      await visitAll(world.student, lesson.progress.id, [keys.exp, keys.k1, keys.q1]);
      const qid = questionId(lesson, keys.q1);
      for (const studentAnswer of ['', '   ', 'x'.repeat(201), 42, null]) {
        expect((await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: qid, studentAnswer })).status).toBe(400);
      }
      expect(await LessonAnswer.count({ where: { lessonProgressId: lesson.progress.id } })).toBe(0);
    });
  });

  describe('reinforcements are scoped to the story', () => {
    test('answering questions or finishing the narrative does not complete any reinforcement', async () => {
      const { story, keys } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      await visitAll(world.student, lesson.progress.id, [keys.exp, keys.k1, keys.q1]);
      await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: questionId(lesson, keys.q1), studentAnswer: 'En la fiesta' });
      await visitAll(world.student, lesson.progress.id, [keys.k2, keys.q2]);
      await answer(world.student, lesson.progress.id, { blockKey: keys.q2, questionId: questionId(lesson, keys.q2), studentAnswer: 'Sí' });
      expect((await as(world.student).post(`/api/lesson-plans/progress/${lesson.progress.id}/complete-narrative`)).status).toBe(200);

      expect(await LessonReinforcement.count({ where: { lessonProgressId: lesson.progress.id } })).toBe(0);
      expect((await openLesson(world.student, story.id)).body.progress.reinforcements).toEqual([]);
    });

    test('reinforcements completed in one story do not appear completed in another', async () => {
      const a = await publishedStory('A');
      const b = await publishedStory('B');
      const lessonA = (await openLesson(world.student, a.story.id)).body;
      const lessonB = (await openLesson(world.student, b.story.id)).body;

      const done = await as(world.student).put(`/api/lesson-plans/progress/${lessonA.progress.id}/reinforcements/${a.keys.flash}`, { completed: true });
      expect(done.status).toBe(200);
      expect(done.body).toEqual({ blockKey: a.keys.flash, completed: true });

      const afterA = (await openLesson(world.student, a.story.id)).body;
      const afterB = (await openLesson(world.student, b.story.id)).body;
      expect(afterA.progress.reinforcements).toEqual([{ blockKey: a.keys.flash, completed: true }]);
      expect(afterB.progress.reinforcements).toEqual([]);
      expect(lessonB.progress.id).not.toBe(lessonA.progress.id);

      // The block of story A cannot be completed through the progress of story B.
      const cross = await as(world.student).put(`/api/lesson-plans/progress/${lessonB.progress.id}/reinforcements/${a.keys.flash}`, { completed: true });
      expect(cross.status).toBe(400);
      expect(await LessonReinforcement.count({ where: { lessonProgressId: lessonB.progress.id } })).toBe(0);

      // The other student is not affected.
      expect((await openLesson(world.student2, a.story.id)).body.progress.reinforcements).toEqual([]);
    });

    test('only reinforcement blocks can be completed, and only with completed: true', async () => {
      const { story, keys } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      const put = (blockKey, body) => as(world.student).put(`/api/lesson-plans/progress/${lesson.progress.id}/reinforcements/${blockKey}`, body);

      expect((await put(keys.q1, { completed: true })).status).toBe(400);
      expect((await put(keys.flash, { completed: false })).status).toBe(400);
      expect((await put(keys.flash, {})).status).toBe(400);
      expect((await put(keys.flash, { completed: true })).status).toBe(200);
      expect((await put(keys.flash, { completed: true })).status).toBe(200); // idempotent
      expect(await LessonReinforcement.count({ where: { lessonProgressId: lesson.progress.id } })).toBe(1);
    });

    test('the course listing reports narrative completion per story', async () => {
      const a = await publishedStory('A');
      const b = await publishedStory('B');
      const lessonA = (await openLesson(world.student2, a.story.id)).body;
      await openLesson(world.student2, b.story.id);
      await visitAll(world.student2, lessonA.progress.id, [a.keys.exp, a.keys.k1, a.keys.q1, a.keys.k2, a.keys.q2]);
      expect((await as(world.student2).post(`/api/lesson-plans/progress/${lessonA.progress.id}/complete-narrative`)).status).toBe(200);

      const res = await as(world.student2).get('/api/enrollments/my-courses');
      expect(res.status).toBe(200);
      const progress = res.body.find(e => e.id === world.enrollments.student2.id).lessonProgress;
      expect(progress.find(p => p.storyId === a.story.id).narrativeCompleted).toBe(true);
      expect(progress.find(p => p.storyId === b.story.id).narrativeCompleted).toBe(false);
      expect(await LessonProgress.count({ where: { enrollmentId: world.enrollments.student2.id, storyId: a.story.id } })).toBe(1);
    });
  });
});
