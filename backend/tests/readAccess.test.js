// Read endpoints that used to be public: tooltips need a course teacher or an enrolled student.
const { Tooltip, RepetitionActivity } = require('../src/models');
const { as, createWorld, createStory } = require('./helpers/fixtures');

describe('Authenticated reads of tooltips', () => {
  let world; let content;
  beforeAll(async () => {
    world = await createWorld();
    content = await createStory(world);
    await Tooltip.create({ targetType: 'story', targetId: content.story.id, startOffset: 0, endOffset: 5, selectedText: 'Texto',
      tooltipContent: 'Text', createdBy: world.teacher.id });
    await Tooltip.create({ targetType: 'question', targetId: content.q1.id, startOffset: 1, endOffset: 6, selectedText: 'Dónde',
      tooltipContent: 'Where', createdBy: world.teacher.id });
  });

  const endpoints = () => [
    ['story tooltips', `/api/tooltips/story/${content.story.id}`, body => expect(body.map(t => t.selectedText)).toEqual(['Texto'])],
    ['question tooltips', `/api/tooltips/question/${content.q1.id}`, body => expect(body.map(t => t.selectedText)).toEqual(['Dónde'])]
  ];

  test.each([0, 1])('endpoint %i: 401 without token, 403 outside the course, 200 for the owner teacher and enrolled students', async index => {
    const [, url, check] = endpoints()[index];

    expect((await as(null).get(url)).status).toBe(401);
    expect((await as({ token: 'garbage' }).get(url)).status).toBe(401);
    expect((await as(world.otherTeacher).get(url)).status).toBe(403);
    expect((await as(world.outsider).get(url)).status).toBe(403);
    for (const user of [world.teacher, world.student, world.student2]) {
      const res = await as(user).get(url);
      expect(res.status).toBe(200);
      check(res.body);
    }
  });

  test('unknown targets answer 404', async () => {
    expect((await as(world.teacher).get('/api/tooltips/story/99999999')).status).toBe(404);
    expect((await as(world.teacher).get('/api/tooltips/question/99999999')).status).toBe(404);
    expect((await as(world.teacher).get('/api/tooltips/story/abc')).status).toBe(404);
  });

  test('an unenrolled student gets 403 even for a story of a foreign course', async () => {
    const res = await as(world.student).get(`/api/tooltips/story/${world.foreignStory.id}`);
    expect(res.status).toBe(403);
  });

  test('the removed legacy endpoints no longer exist', async () => {
    expect((await as(world.teacher).get(`/api/activity-configs/story/${content.story.id}`)).status).toBe(404);
    expect((await as(world.student).post('/api/question-responses/submit', {})).status).toBe(404);
  });
});

// Course content reads are not public: the teacher of the course or an enrolled student only.
describe('Authenticated reads of course content', () => {
  let world; let content; let drafted;
  beforeAll(async () => {
    world = await createWorld();
    content = await createStory(world);
    await RepetitionActivity.create({ storyId: content.story.id, phrase: 'Me llamo María', order: 0 });
    drafted = world.course; // unpublished and unpriced on purpose: access depends on the enrollment, not on publication
  });

  const endpoints = () => [
    ['course', `/api/courses/${world.course.id}`, body => expect(body.id).toBe(world.course.id)],
    ['unit', `/api/units/${world.unit.id}`, body => expect(body.id).toBe(world.unit.id)],
    ['unit vocabulary', `/api/vocabulary/unit/${world.unit.id}`, body => expect(body.map(v => v.word).sort()).toEqual(['Me llamo', 'Mucho gusto'])],
    ['story repetition activities', `/api/repetition-activities/story/${content.story.id}`, body => expect(body.map(a => a.phrase)).toEqual(['Me llamo María'])]
  ];

  test.each([0, 1, 2, 3])('endpoint %i: 401 without token, 403 outside the course, 200 for the owner teacher and enrolled students', async index => {
    const [, url, check] = endpoints()[index];

    expect((await as(null).get(url)).status).toBe(401);
    expect((await as({ token: 'garbage' }).get(url)).status).toBe(401);
    expect((await as(world.otherTeacher).get(url)).status).toBe(403);
    expect((await as(world.outsider).get(url)).status).toBe(403);
    for (const user of [world.teacher, world.student, world.student2]) {
      const res = await as(user).get(url);
      expect(res.status).toBe(200);
      check(res.body);
    }
  });

  test('content of a published, paid course stays closed to people who did not buy it', async () => {
    await drafted.update({ isPublished: true, price: 1999 });
    for (const [, url] of endpoints()) {
      expect((await as(null).get(url)).status).toBe(401);
      expect((await as(world.outsider).get(url)).status).toBe(403);
    }
  });

  test('unknown or malformed ids answer 404 to a logged-in user', async () => {
    for (const url of ['/api/courses/99999999', '/api/units/99999999', '/api/vocabulary/unit/99999999', '/api/repetition-activities/story/99999999',
      '/api/courses/abc', '/api/units/abc', '/api/vocabulary/unit/abc', '/api/repetition-activities/story/abc']) {
      expect((await as(world.teacher).get(url)).status).toBe(404);
    }
  });
});
