// Datos que la gestión del curso y la pantalla de maestros necesitan para mostrarse.
const { as, createWorld, createStory, standardBlocks, saveDraft, publishPlan } = require('./helpers/fixtures');

describe('GET /api/courses/:id (datos de gestión)', () => {
  let world; let published; let draftOnly;
  beforeAll(async () => {
    world = await createWorld();
    published = await createStory(world, 'Publicada');
    draftOnly = await createStory(world, 'Borrador');
    await publishPlan(world.teacher, published.story.id, standardBlocks({ vocab: world.vocab, ...published }).blocks);
    await saveDraft(world.teacher, draftOnly.story.id, standardBlocks({ vocab: world.vocab, ...draftOnly }).blocks);
  });

  test('cada historia indica si está publicada o en borrador y el curso cuenta sus inscritos', async () => {
    const res = await as(world.teacher).get(`/api/courses/${world.course.id}`);
    expect(res.status).toBe(200);
    const stories = res.body.units.flatMap(u => u.stories);
    expect(stories.find(s => s.id === published.story.id).lessonStatus).toBe('published');
    expect(stories.find(s => s.id === draftOnly.story.id).lessonStatus).toBe('draft');
    expect(res.body.enrollmentCount).toBe(2);
  });
});

describe('GET /api/users/teachers', () => {
  test('lista a los profesores con su cantidad de cursos', async () => {
    const world = await createWorld();
    const res = await as(world.student).get('/api/users/teachers');
    expect(res.status).toBe(200);
    const owner = res.body.find(t => t.id === world.teacher.id);
    expect(owner).toBeTruthy();
    expect(Number(owner.coursesCount)).toBe(1);
  });

  test('exige sesión', async () => {
    expect((await as(null).get('/api/users/teachers')).status).toBe(401);
  });
});
