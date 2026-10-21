// Read endpoints that used to be public: activity configs and tooltips need a course teacher or an enrolled student.
const { ActivityConfig, Tooltip } = require('../src/models');
const { as, createWorld, createStory } = require('./helpers/fixtures');

describe('Authenticated reads of activity configs and tooltips', () => {
  let world; let content;
  beforeAll(async () => {
    world = await createWorld();
    content = await createStory(world);
    await ActivityConfig.create({ storyId: content.story.id, activityType: 'flashcards', isEnabled: true, order: 0, requiredStoryIds: [] });
    await Tooltip.create({ targetType: 'story', targetId: content.story.id, startOffset: 0, endOffset: 5, selectedText: 'Texto',
      tooltipContent: 'Text', createdBy: world.teacher.id });
    await Tooltip.create({ targetType: 'question', targetId: content.q1.id, startOffset: 1, endOffset: 6, selectedText: 'Dónde',
      tooltipContent: 'Where', createdBy: world.teacher.id });
  });

  const endpoints = () => [
    ['activity configs', `/api/activity-configs/story/${content.story.id}`, body => expect(body).toHaveLength(1)],
    ['story tooltips', `/api/tooltips/story/${content.story.id}`, body => expect(body.map(t => t.selectedText)).toEqual(['Texto'])],
    ['question tooltips', `/api/tooltips/question/${content.q1.id}`, body => expect(body.map(t => t.selectedText)).toEqual(['Dónde'])]
  ];

  test.each([0, 1, 2])('endpoint %i: 401 without token, 403 outside the course, 200 for the owner teacher and enrolled students', async index => {
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
    expect((await as(world.teacher).get('/api/activity-configs/story/99999999')).status).toBe(404);
    expect((await as(world.teacher).get('/api/tooltips/story/99999999')).status).toBe(404);
    expect((await as(world.teacher).get('/api/tooltips/question/99999999')).status).toBe(404);
    expect((await as(world.teacher).get('/api/tooltips/story/abc')).status).toBe(404);
  });

  test('an unenrolled student gets 403 even for a story of a foreign course', async () => {
    const res = await as(world.student).get(`/api/activity-configs/story/${world.foreignStory.id}`);
    expect(res.status).toBe(403);
  });
});
