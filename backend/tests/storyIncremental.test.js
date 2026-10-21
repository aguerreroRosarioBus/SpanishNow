// Incremental composition: a story is created with only a title and written fragment by fragment in the lesson composer.
const request = require('supertest');
const { randomUUID } = require('crypto');
const { Story, LessonPlan, LessonBlock } = require('../src/models');
const { auditCourse } = require('../src/services/tprsAudit');
const { as, app, createWorld, createStory, standardBlocks, planUrl, saveDraft } = require('./helpers/fixtures');

describe('Incremental story composition', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  const createEmptyStory = async (body = {}) => {
    const res = await as(world.teacher).post('/api/stories', { unitId: world.unit.id, title: `Vacía ${randomUUID().slice(0, 6)}`, ...body });
    expect(res.status).toBe(201);
    return res.body;
  };
  const getDraft = storyId => as(world.teacher).get(`${planUrl(storyId)}/draft`);
  const publish = (storyId, revision) => as(world.teacher).post(`${planUrl(storyId)}/publish`, { revision });
  const emptyKeyframe = () => ({ blockKey: randomUUID(), type: 'keyframe', phase: 'during', text: '' });
  const fullStory = () => ({ blockKey: randomUUID(), type: 'full_story', phase: 'after' });

  describe('POST /api/stories without text', () => {
    test('creates the story with an empty text (JSON)', async () => {
      const story = await createEmptyStory();
      expect(story.text).toBe('');
      expect((await Story.findByPk(story.id)).text).toBe('');
    });

    test('creates the story with an empty text (multipart, no audio)', async () => {
      const res = await request(app).post('/api/stories').set('Authorization', `Bearer ${world.teacher.token}`)
        .field('unitId', String(world.unit.id)).field('title', 'Multipart sin texto');
      expect(res.status).toBe(201);
      expect(res.body.text).toBe('');
    });

    test('still stores the text when it is sent', async () => {
      const story = await createEmptyStory({ text: 'Hola mundo.' });
      expect(story.text).toBe('Hola mundo.');
    });

    test.each([['title', { title: undefined }], ['unitId', { unitId: undefined }]])('still requires %s', async (_name, override) => {
      const res = await as(world.teacher).post('/api/stories', { unitId: world.unit.id, title: 'x', ...override });
      expect(res.status).toBe(400);
    });

    test('rejects a text that is not a string', async () => {
      const res = await as(world.teacher).post('/api/stories', { unitId: world.unit.id, title: 'x', text: { a: 1 } });
      expect(res.status).toBe(400);
    });

    test('the student endpoints do not break with an empty text', async () => {
      const story = await createEmptyStory();
      const res = await as(world.student).get(`/api/stories/${story.id}`);
      expect(res.status).toBe(200);
      expect(res.body.text).toBe('');
      expect((await as(world.student).get(planUrl(story.id))).status).toBe(404); // nothing published yet
    });
  });

  describe('GET /api/courses/:id hasLessonPlan', () => {
    test('flags only the stories that already have a lesson plan', async () => {
      const withPlan = await createEmptyStory();
      const withoutPlan = await createEmptyStory();
      expect((await getDraft(withPlan.id)).status).toBe(200);
      const res = await as(world.teacher).get(`/api/courses/${world.course.id}`);
      expect(res.status).toBe(200);
      const stories = res.body.units.flatMap(unit => unit.stories);
      expect(stories.find(story => story.id === withPlan.id).hasLessonPlan).toBe(true);
      expect(stories.find(story => story.id === withoutPlan.id).hasLessonPlan).toBe(false);
    });
  });

  describe('PUT /api/stories/:id text ownership', () => {
    test('accepts a text change while the story has no lesson plan', async () => {
      const story = await createEmptyStory();
      const res = await as(world.teacher).put(`/api/stories/${story.id}`, { text: 'Nuevo texto.' });
      expect(res.status).toBe(200);
      expect((await Story.findByPk(story.id)).text).toBe('Nuevo texto.');
    });

    test('rejects a different text with 409 once a draft exists, and keeps title edits working', async () => {
      const story = await createEmptyStory();
      expect((await getDraft(story.id)).status).toBe(200);

      const res = await as(world.teacher).put(`/api/stories/${story.id}`, { text: 'Otro texto.', title: 'Título nuevo' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/compositor/);
      const stored = await Story.findByPk(story.id);
      expect(stored.text).toBe('');
      expect(stored.title).not.toBe('Título nuevo'); // the rejected request changed nothing

      const ok = await as(world.teacher).put(`/api/stories/${story.id}`, { title: 'Título nuevo' });
      expect(ok.status).toBe(200);
      expect((await Story.findByPk(story.id)).title).toBe('Título nuevo');
    });

    test('accepts the identical text (the frontend may resend it) while a plan exists', async () => {
      const { story } = await createStory(world);
      expect((await getDraft(story.id)).status).toBe(200);
      const res = await as(world.teacher).put(`/api/stories/${story.id}`, { title: 'Mismo texto', text: story.text });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Mismo texto');
    });

    test('rejects a different text once the story is published', async () => {
      const { story, q1, q2 } = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.vocab, q1, q2 });
      const saved = await saveDraft(world.teacher, story.id, blocks);
      expect((await publish(story.id, saved.body.revision)).status).toBe(201);
      const res = await as(world.teacher).put(`/api/stories/${story.id}`, { text: 'Cambio directo.' });
      expect(res.status).toBe(409);
    });
  });

  describe('lesson draft of a story without text', () => {
    test('the first draft has one empty keyframe and the full_story block', async () => {
      const story = await createEmptyStory();
      const res = await getDraft(story.id);
      expect(res.status).toBe(200);
      expect(res.body.blocks.map(b => b.type)).toEqual(['keyframe', 'full_story']);
      expect(res.body.blocks[0].text || '').toBe('');
      expect(res.body.blocks[0].active).toBe(true);
    });

    test('a story that already has text still seeds the keyframe with it', async () => {
      const story = await createEmptyStory({ text: 'Texto inicial.' });
      expect((await getDraft(story.id)).body.blocks[0].text).toBe('Texto inicial.');
    });

    test.each([['empty', ''], ['blank', '   \n'], ['missing', undefined], ['null', null]])('a draft with an %s active keyframe text saves', async (_name, text) => {
      const story = await createEmptyStory();
      const keyframe = emptyKeyframe();
      if (text === undefined) delete keyframe.text; else keyframe.text = text;
      const res = await saveDraft(world.teacher, story.id, [keyframe, fullStory()]);
      expect(res.status).toBe(200);
      expect(res.body.blocks).toHaveLength(2);
    });

    test('a draft with a half-written keyframe plus an empty one saves', async () => {
      const story = await createEmptyStory();
      const res = await saveDraft(world.teacher, story.id, [{ ...emptyKeyframe(), text: 'Ana llega.' }, emptyKeyframe(), fullStory()]);
      expect(res.status).toBe(200);
    });

    test('the keyframe text length limit still applies to drafts', async () => {
      const story = await createEmptyStory();
      const res = await saveDraft(world.teacher, story.id, [{ ...emptyKeyframe(), text: 'a'.repeat(20001) }, fullStory()]);
      expect(res.status).toBe(400);
    });

    test('publishing with an empty active keyframe fails with 422 and publishes nothing', async () => {
      const story = await createEmptyStory();
      const saved = await saveDraft(world.teacher, story.id, [{ ...emptyKeyframe(), text: 'Ana llega.' }, emptyKeyframe(), fullStory()]);
      expect(saved.status).toBe(200);
      const res = await publish(story.id, saved.body.revision);
      expect(res.status).toBe(422);
      expect(await LessonPlan.count({ where: { storyId: story.id, status: 'published' } })).toBe(0);
      expect((await Story.findByPk(story.id)).text).toBe('');
    });

    test('publishing with a blank-only keyframe fails with 422', async () => {
      const story = await createEmptyStory();
      const saved = await saveDraft(world.teacher, story.id, [{ ...emptyKeyframe(), text: '   ' }, fullStory()]);
      expect((await publish(story.id, saved.body.revision)).status).toBe(422);
    });

    test('an inactive empty keyframe does not block publishing', async () => {
      const story = await createEmptyStory();
      const saved = await saveDraft(world.teacher, story.id, [{ ...emptyKeyframe(), text: 'Ana llega.' }, { ...emptyKeyframe(), active: false }, fullStory()]);
      expect((await publish(story.id, saved.body.revision)).status).toBe(201);
    });

    test('publishing rebuilds Story.text from the active keyframes', async () => {
      const story = await createEmptyStory();
      const blocks = [{ ...emptyKeyframe(), text: ' Ana llega a casa. ' }, { ...emptyKeyframe(), text: 'Ana ve a Juan.' }, fullStory()];
      const saved = await saveDraft(world.teacher, story.id, blocks);
      expect(saved.status).toBe(200);
      const res = await publish(story.id, saved.body.revision);
      expect(res.status).toBe(201);
      expect((await Story.findByPk(story.id)).text).toBe('Ana llega a casa.\n\nAna ve a Juan.');
      const lesson = await as(world.student).get(planUrl(story.id));
      expect(lesson.status).toBe(200);
      expect(lesson.body.story.fullStoryText).toBe('Ana llega a casa.\n\nAna ve a Juan.');
    });

    test('the empty keyframe is stored without text rows breaking the plan', async () => {
      const story = await createEmptyStory();
      const draft = (await getDraft(story.id)).body;
      const rows = await LessonBlock.findAll({ where: { planId: draft.id, type: 'keyframe' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].text || '').toBe('');
    });
  });

  describe('inline creation of questions and vocabulary (no audio)', () => {
    const teacherPost = (path) => request(app).post(path).set('Authorization', `Bearer ${world.teacher.token}`);

    test('yes/no question as JSON', async () => {
      const story = await createEmptyStory();
      const res = await as(world.teacher).post('/api/questions', { storyId: story.id, questionText: '¿Ana llega?', answerType: 'yes_no', correctAnswer: 'Sí' });
      expect(res.status).toBe(201);
      expect(res.body.audioUrl).toBeNull();
    });

    test('choice question as JSON', async () => {
      const story = await createEmptyStory();
      const res = await as(world.teacher).post('/api/questions', { storyId: story.id, questionText: '¿Dónde?', answerType: 'choice', options: ['Casa', 'Escuela'], correctAnswer: 'Casa' });
      expect(res.status).toBe(201);
      expect(res.body.options).toEqual(['Casa', 'Escuela']);
    });

    test('choice question as multipart with options[] fields', async () => {
      const story = await createEmptyStory();
      const res = await teacherPost('/api/questions').field('storyId', String(story.id)).field('questionText', '¿Dónde?')
        .field('answerType', 'choice').field('options[]', 'Casa').field('options[]', 'Escuela').field('correctAnswer', 'Casa');
      expect(res.status).toBe(201);
      expect(res.body.options).toEqual(['Casa', 'Escuela']);
    });

    test('questionType is not the field name: answerType is', async () => {
      const story = await createEmptyStory();
      const res = await as(world.teacher).post('/api/questions', { storyId: story.id, questionText: '¿Ana?', questionType: 'yes_no', correctAnswer: 'Sí' });
      expect(res.status).toBe(400);
    });

    test('vocabulary as JSON and as multipart', async () => {
      const json = await as(world.teacher).post('/api/vocabulary', { unitId: world.unit.id, word: 'Llega', translation: 'Arrives' });
      expect(json.status).toBe(201);
      const multipart = await teacherPost('/api/vocabulary').field('unitId', String(world.unit.id)).field('word', 'Sale').field('translation', 'Leaves');
      expect(multipart.status).toBe(201);
      expect(multipart.body.audioUrl).toBeNull();
    });

    test('a created question can be referenced from the draft and the lesson publishes', async () => {
      const story = await createEmptyStory();
      const q = (await as(world.teacher).post('/api/questions', { storyId: story.id, questionText: '¿Ana llega?', answerType: 'yes_no', correctAnswer: 'Sí' })).body;
      const k = { ...emptyKeyframe(), text: 'Ana llega.' };
      const saved = await saveDraft(world.teacher, story.id, [k, { blockKey: randomUUID(), type: 'question', phase: 'during', questionId: q.id, contextBlockKey: k.blockKey }, fullStory()]);
      expect(saved.status).toBe(200);
      expect((await publish(story.id, saved.body.revision)).status).toBe(201);
    });
  });

  describe('TPRS audit with an empty story text', () => {
    test('does not crash and reports findings', () => {
      const audit = auditCourse({ vocabulary: [], stories: [{ id: 1, title: 'Vacía', unit: { id: 1, order: 1, title: 'U1' }, order: 0, text: '',
        questions: [], plan: { before: [], keyframes: [{ text: '', questions: [] }], after: [], later: [] } }] });
      expect(audit.stories).toHaveLength(1);
      expect(audit.summary.stories).toBe(1);
    });

    test('does not crash when the text is missing entirely', () => {
      const audit = auditCourse({ vocabulary: [], stories: [{ id: 1, title: 'Sin nada', unit: { id: 1, order: 1, title: 'U1' }, order: 0,
        questions: [], plan: { before: [], keyframes: [], after: [], later: [] } }] });
      expect(audit.summary.stories).toBe(1);
    });
  });
});
