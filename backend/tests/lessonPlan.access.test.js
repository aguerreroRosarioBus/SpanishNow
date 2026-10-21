// Visibility of answers and authorization (roles, course ownership, enrollment, cross-story).
const { Question, Story, LessonPlan } = require('../src/models');
const { as, createWorld, createStory, standardBlocks, planUrl, saveDraft, publishPlan,
  openLesson, visit, answer, findKeys } = require('./helpers/fixtures');

const SECRET_KEYS = /^(correct\w*|solution|answerKey|expectedAnswer)$/i;

describe('TPRS lesson plans: answer visibility and access control', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  async function publishedStory() {
    const content = await createStory(world);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    await publishPlan(world.teacher, content.story.id, blocks);
    return { ...content, keys };
  }

  describe('correctAnswer exposure', () => {
    test('the student never receives correctAnswer (or equivalents) in the published lesson', async () => {
      const { story } = await publishedStory();
      const res = await openLesson(world.student, story.id);

      expect(res.status).toBe(200);
      expect(findKeys(res.body, SECRET_KEYS)).toEqual([]);
      // The question is still delivered, just without its key.
      const questionBlocks = res.body.blocks.filter(b => b.type === 'question');
      expect(questionBlocks).toHaveLength(2);
      expect(questionBlocks[0].question).toMatchObject({ questionText: '¿Dónde está María?', answerType: 'choice', options: ['En la fiesta', 'En la escuela'] });
      expect(res.body.blocks.some(b => 'questionSnapshot' in b || 'vocabularySnapshot' in b)).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/correctAnswer/);
    });

    test('the owner teacher sees correctAnswer in the draft', async () => {
      const { story, q1, q2 } = await publishedStory();
      const res = await as(world.teacher).get(`${planUrl(story.id)}/draft`);

      expect(res.status).toBe(200);
      const answers = res.body.blocks.filter(b => b.type === 'question').map(b => b.questionSnapshot.correctAnswer);
      expect(answers).toEqual([q1.correctAnswer, q2.correctAnswer]);
    });

    test('a wrong answer response does not reveal the correct answer either', async () => {
      const { story, keys } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      for (const key of [keys.exp, keys.k1, keys.q1]) expect((await visit(world.student, lesson.progress.id, key)).status).toBe(200);

      const wrong = await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: lesson.blocks.find(b => b.blockKey === keys.q1).questionId, studentAnswer: 'En la escuela' });

      expect(wrong.status).toBe(200);
      expect(wrong.body.isCorrect).toBe(false);
      expect(findKeys(wrong.body, SECRET_KEYS)).toEqual([]);
    });

    test('legacy question and story endpoints hide correctAnswer from students but not from the owner', async () => {
      const { story } = await publishedStory();

      const studentQuestions = await as(world.student).get(`/api/questions/story/${story.id}`);
      const studentStory = await as(world.student).get(`/api/stories/${story.id}`);
      expect(studentQuestions.status).toBe(200);
      expect(studentStory.status).toBe(200);
      expect(findKeys(studentQuestions.body, SECRET_KEYS)).toEqual([]);
      expect(findKeys(studentStory.body, SECRET_KEYS)).toEqual([]);

      const ownerQuestions = await as(world.teacher).get(`/api/questions/story/${story.id}`);
      expect(ownerQuestions.body.every(q => typeof q.correctAnswer === 'string')).toBe(true);
    });
  });

  describe('student access to a lesson', () => {
    test('requires authentication', async () => {
      const { story } = await publishedStory();
      expect((await as(null).get(planUrl(story.id))).status).toBe(401);
    });

    test('a student not enrolled in the course is rejected and no progress is created', async () => {
      const { story } = await publishedStory();
      const res = await openLesson(world.outsider, story.id);
      expect(res.status).toBe(403);
      expect(res.body.progress).toBeUndefined();
    });

    test('a teacher cannot use the student endpoint', async () => {
      const { story } = await publishedStory();
      expect((await openLesson(world.teacher, story.id)).status).toBe(403);
    });

    test('a story without a published revision is not available to students', async () => {
      const { story } = await createStory(world);
      await as(world.teacher).get(`${planUrl(story.id)}/draft`); // creates a draft only
      expect((await openLesson(world.student, story.id)).status).toBe(404);
    });

    test('an invalid or unknown story id is rejected', async () => {
      expect((await openLesson(world.student, 'abc')).status).toBe(400);
      expect((await openLesson(world.student, 99999999)).status).toBe(404);
    });

    test('the draft is never delivered to students', async () => {
      const { story, keys } = await publishedStory();
      // A new draft (revision 2) with an extra keyframe must not leak before publishing.
      const draft = (await as(world.teacher).get(`${planUrl(story.id)}/draft`)).body;
      const extra = { blockKey: '11111111-1111-4111-8111-111111111111', type: 'keyframe', phase: 'during', text: 'Solo en el borrador.' };
      const withExtra = [...draft.blocks.slice(0, 2), extra, ...draft.blocks.slice(2)];
      expect((await saveDraft(world.teacher, story.id, withExtra)).status).toBe(200);

      const lesson = await openLesson(world.student, story.id);
      expect(lesson.body.revision).toBe(1);
      expect(JSON.stringify(lesson.body)).not.toContain('Solo en el borrador');
      expect(lesson.body.blocks.map(b => b.blockKey)).toContain(keys.k1);
    });
  });

  describe('answering questions of another story or student', () => {
    test('a student cannot answer a question that belongs to another story', async () => {
      const a = await publishedStory();
      const b = await publishedStory();
      const lessonA = (await openLesson(world.student, a.story.id)).body;
      for (const key of [a.keys.exp, a.keys.k1, a.keys.q1]) await visit(world.student, lessonA.progress.id, key);

      // question of story B on block of story A
      const foreignQuestion = await answer(world.student, lessonA.progress.id, { blockKey: a.keys.q1, questionId: b.q1.id, studentAnswer: 'En la fiesta' });
      expect(foreignQuestion.status).toBeGreaterThanOrEqual(400);
      expect(foreignQuestion.status).toBeLessThan(500);

      // block of story B on progress of story A
      const foreignBlock = await answer(world.student, lessonA.progress.id, { blockKey: b.keys.q1, questionId: b.q1.id, studentAnswer: 'En la fiesta' });
      expect(foreignBlock.status).toBeGreaterThanOrEqual(400);
      expect(foreignBlock.status).toBeLessThan(500);

      // nothing was recorded
      const after = (await openLesson(world.student, a.story.id)).body;
      expect(after.progress.answers).toEqual([]);
    });

    test('a block that is not a question cannot be answered', async () => {
      const { story, keys, q1 } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      await visit(world.student, lesson.progress.id, keys.exp);
      const res = await answer(world.student, lesson.progress.id, { blockKey: keys.exp, questionId: q1.id, studentAnswer: 'x' });
      expect(res.status).toBe(400);
    });

    test('a student cannot use or modify another student\'s progress', async () => {
      const { story, keys, q1 } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      for (const key of [keys.exp, keys.k1, keys.q1]) await visit(world.student, lesson.progress.id, key);

      expect((await visit(world.student2, lesson.progress.id, keys.k2)).status).toBe(403);
      expect((await answer(world.student2, lesson.progress.id, { blockKey: keys.q1, questionId: q1.id, studentAnswer: 'En la fiesta' })).status).toBe(403);
      expect((await as(world.student2).post(`/api/lesson-plans/progress/${lesson.progress.id}/complete-narrative`)).status).toBe(403);
      expect((await as(world.student2).put(`/api/lesson-plans/progress/${lesson.progress.id}/reinforcements/${keys.flash}`, { completed: true })).status).toBe(403);
      expect((await as(world.outsider).put(`/api/lesson-plans/progress/${lesson.progress.id}/current-block`, { blockKey: keys.k2 })).status).toBe(403);
    });

    test('a student must reach the question before answering it', async () => {
      const { story, keys, q1 } = await publishedStory();
      const lesson = (await openLesson(world.student, story.id)).body;
      const res = await answer(world.student, lesson.progress.id, { blockKey: keys.q1, questionId: q1.id, studentAnswer: 'En la fiesta' });
      expect(res.status).toBe(409);
    });

    test('the legacy submit endpoint rejects questions from another story', async () => {
      const a = await publishedStory();
      const b = await publishedStory();
      const enrollment = world.enrollments.student;
      const progress = await as(world.student).post('/api/enrollments/progress', { enrollmentId: enrollment.id, storyId: a.story.id });
      expect([200, 201]).toContain(progress.status);

      const res = await as(world.student).post('/api/question-responses/submit', {
        progressId: progress.body.id, responses: [{ questionId: b.q1.id, studentAnswer: 'En la fiesta' }]
      });
      expect(res.status).toBe(400);

      const other = await as(world.student2).post('/api/question-responses/submit', {
        progressId: progress.body.id, responses: [{ questionId: a.q1.id, studentAnswer: 'En la fiesta' }]
      });
      expect(other.status).toBe(403);
    });

    test('a student cannot register progress for a story outside their enrollment', async () => {
      const res = await as(world.student).post('/api/enrollments/progress', {
        enrollmentId: world.enrollments.student.id, storyId: world.foreignStory.id
      });
      expect(res.status).toBe(403);
      const hijack = await as(world.outsider).post('/api/enrollments/progress', {
        enrollmentId: world.enrollments.student.id, storyId: world.foreignStory.id
      });
      expect(hijack.status).toBe(403);
    });
  });

  describe('teacher endpoints require the course owner', () => {
    const forbidden = status => [403, 404].includes(status);

    test('another teacher cannot read, edit or publish the draft, and the draft is left untouched', async () => {
      const { story, keys } = await publishedStory();
      const before = (await as(world.teacher).get(`${planUrl(story.id)}/draft`)).body;
      const tampered = before.blocks.map(b => (b.blockKey === keys.k1 ? { ...b, text: 'Texto manipulado' } : b));

      const read = await as(world.otherTeacher).get(`${planUrl(story.id)}/draft`);
      const edit = await as(world.otherTeacher).put(`${planUrl(story.id)}/draft`, { revision: before.revision, blocks: tampered });
      const reorder = await as(world.otherTeacher).put(`${planUrl(story.id)}/draft/reorder`, { revision: before.revision, blockKeys: before.blocks.map(b => b.blockKey).reverse() });
      const publish = await as(world.otherTeacher).post(`${planUrl(story.id)}/publish`, { revision: before.revision });

      for (const res of [read, edit, reorder, publish]) expect(forbidden(res.status)).toBe(true);
      expect(read.body.blocks).toBeUndefined();

      const after = (await as(world.teacher).get(`${planUrl(story.id)}/draft`)).body;
      expect(after).toEqual(before);
      expect(await LessonPlan.count({ where: { storyId: story.id, status: 'published' } })).toBe(1);
      expect((await Story.findByPk(story.id)).text).not.toContain('manipulado');
    });

    test('a student cannot read, edit or publish the draft', async () => {
      const { story } = await publishedStory();
      const draft = (await as(world.teacher).get(`${planUrl(story.id)}/draft`)).body;

      const read = await as(world.student).get(`${planUrl(story.id)}/draft`);
      const edit = await as(world.student).put(`${planUrl(story.id)}/draft`, { revision: draft.revision, blocks: draft.blocks });
      const publish = await as(world.student).post(`${planUrl(story.id)}/publish`, { revision: draft.revision });

      for (const res of [read, edit, publish]) expect(forbidden(res.status)).toBe(true);
      expect(read.body.blocks).toBeUndefined();
    });

    test('unauthenticated requests are rejected', async () => {
      const { story } = await publishedStory();
      expect((await as(null).get(`${planUrl(story.id)}/draft`)).status).toBe(401);
      expect((await as(null).post(`${planUrl(story.id)}/publish`, { revision: 1 })).status).toBe(401);
    });

    test('an unknown or invalid story id yields 404 / 400 for the teacher', async () => {
      expect((await as(world.teacher).get(`${planUrl(99999999)}/draft`)).status).toBe(404);
      expect((await as(world.teacher).get(`${planUrl('abc')}/draft`)).status).toBe(400);
    });

    test('the question and activity-config endpoints also require course ownership', async () => {
      const { story, q1 } = await publishedStory();

      const create = await as(world.otherTeacher).post('/api/questions', { storyId: story.id, questionText: '¿Hola?', answerType: 'yes_no', correctAnswer: 'Sí' });
      const update = await as(world.otherTeacher).put(`/api/questions/${q1.id}`, { questionText: 'Manipulada' });
      const remove = await as(world.otherTeacher).delete(`/api/questions/${q1.id}`);
      const config = await as(world.otherTeacher).post('/api/activity-configs', { storyId: story.id, activityType: 'flashcards', order: 1 });
      const studentConfig = await as(world.student).post('/api/activity-configs', { storyId: story.id, activityType: 'flashcards', order: 1 });
      const studentCreate = await as(world.student).post('/api/questions', { storyId: story.id, questionText: '¿Hola?', answerType: 'yes_no', correctAnswer: 'Sí' });

      for (const res of [create, update, remove, config, studentConfig, studentCreate]) expect(forbidden(res.status)).toBe(true);
      expect((await Question.findByPk(q1.id)).questionText).toBe('¿Dónde está María?');
    });
  });

  describe('references must belong to the same story and course', () => {
    test('a question block cannot reference a question of another story', async () => {
      const a = await createStory(world);
      const b = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.vocab, q1: b.q1, q2: a.q2 });

      const res = await saveDraft(world.teacher, a.story.id, blocks);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Question must belong to this story/);
    });

    test('an expression cannot use vocabulary from another course', async () => {
      const content = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.foreignVocab, ...content });
      const res = await saveDraft(world.teacher, content.story.id, blocks);
      expect(res.status).toBe(400);
    });

    test('a revisit story must be another story of the same course', async () => {
      const content = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.vocab, ...content });
      const later = revisitStoryId => ({ blockKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'expression', phase: 'later',
        vocabularyId: world.vocab.id, vocabularyRole: 'revisit', revisitStoryId });

      expect((await saveDraft(world.teacher, content.story.id, [...blocks, later(content.story.id)])).status).toBe(400);
      expect((await saveDraft(world.teacher, content.story.id, [...blocks, later(world.foreignStory.id)])).status).toBe(400);
      expect((await saveDraft(world.teacher, content.story.id, [...blocks, later(99999999)])).status).toBe(400);
    });
  });
});
