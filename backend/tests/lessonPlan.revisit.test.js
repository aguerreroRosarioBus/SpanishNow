// "Más adelante": scheduling an expression to reappear in another story of the course.
const { randomUUID } = require('crypto');
const { Story, LessonPlan, LessonBlock } = require('../src/models');
const { as, createWorld, createStory, standardBlocks, planUrl, publishPlan, openLesson } = require('./helpers/fixtures');

describe('TPRS lesson plans: planned revisit of an expression in another story', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  const laterBlock = (vocabularyId, revisitStoryId) => ({
    blockKey: randomUUID(), type: 'expression', phase: 'later', vocabularyId, vocabularyRole: 'revisit', revisitStoryId
  });
  const withLater = (content, targetStory, vocab = world.vocab) => {
    const { blocks, keys } = standardBlocks({ vocab: world.vocab2, ...content });
    return { blocks: [...blocks, laterBlock(vocab.id, targetStory.id)], keys };
  };

  test('publishing the source story creates an unpublished draft in the target story with a revisit association', async () => {
    const source = await createStory(world, 'Origen');
    const target = await createStory(world, 'Destino');
    expect(await LessonPlan.count({ where: { storyId: target.story.id } })).toBe(0);

    const { blocks } = withLater(source, target.story);
    const published = await publishPlan(world.teacher, source.story.id, blocks);
    expect(published.status).toBe('published');

    // The target story got a draft, not a published plan.
    const plans = await LessonPlan.findAll({ where: { storyId: target.story.id } });
    expect(plans.map(p => [p.revision, p.status])).toEqual([[1, 'draft']]);
    expect((await openLesson(world.student, target.story.id)).status).toBe(404);

    const draft = (await as(world.teacher).get(`${planUrl(target.story.id)}/draft`)).body;
    expect(draft.status).toBe('draft');
    expect(draft.blocks[0]).toMatchObject({ type: 'expression', phase: 'before', vocabularyId: world.vocab.id, vocabularyRole: 'revisit', active: true, position: 0 });
    expect(draft.blocks[0].blockKey).toMatch(/^[0-9a-f-]{36}$/);
    // The rest of the draft is the compatible default (keyframe + full story) shifted by one.
    expect(draft.blocks.slice(1).map(b => b.type)).toEqual(['keyframe', 'full_story']);
    expect(draft.blocks.map(b => b.position)).toEqual([0, 1, 2]);
    // Target story text is untouched until its own plan is published.
    expect((await Story.findByPk(target.story.id)).text).toBe('Texto original de la historia.');
  });

  test('the later block itself is not shown to students of the source story', async () => {
    const source = await createStory(world, 'Origen');
    const target = await createStory(world, 'Destino');
    const { blocks } = withLater(source, target.story);
    await publishPlan(world.teacher, source.story.id, blocks);

    const lesson = (await openLesson(world.student, source.story.id)).body;
    expect(lesson.blocks.some(b => b.phase === 'later')).toBe(false);
    expect(lesson.blocks.some(b => b.type === 'expression' && b.vocabularyId === world.vocab.id)).toBe(false);
  });

  test('is idempotent: publishing the source again does not duplicate the association', async () => {
    const source = await createStory(world, 'Origen');
    const target = await createStory(world, 'Destino');
    const first = await publishPlan(world.teacher, source.story.id, withLater(source, target.story).blocks);
    // Second revision of the source with the same planned revisit.
    const draft = (await as(world.teacher).get(`${planUrl(source.story.id)}/draft`)).body;
    await publishPlan(world.teacher, source.story.id, draft.blocks);

    const targetPlans = await LessonPlan.findAll({ where: { storyId: target.story.id } });
    expect(targetPlans).toHaveLength(1);
    const revisits = await LessonBlock.count({ where: { planId: targetPlans[0].id, type: 'expression', vocabularyId: world.vocab.id } });
    expect(revisits).toBe(1);
    expect(first.revision).toBe(1);
  });

  test('when the target already has a published lesson, the revisit goes to a new draft and students keep the published revision', async () => {
    const source = await createStory(world, 'Origen');
    const target = await createStory(world, 'Destino');
    const targetBlocks = standardBlocks({ vocab: world.vocab2, ...target });
    await publishPlan(world.teacher, target.story.id, targetBlocks.blocks);
    const before = (await openLesson(world.student, target.story.id)).body;
    expect(before.revision).toBe(1);

    await publishPlan(world.teacher, source.story.id, withLater(source, target.story).blocks);

    const plans = await LessonPlan.findAll({ where: { storyId: target.story.id }, order: [['revision', 'ASC']] });
    expect(plans.map(p => [p.revision, p.status])).toEqual([[1, 'published'], [2, 'draft']]);
    const draft = (await as(world.teacher).get(`${planUrl(target.story.id)}/draft`)).body;
    expect(draft.revision).toBe(2);
    expect(draft.blocks[0]).toMatchObject({ type: 'expression', phase: 'before', vocabularyId: world.vocab.id, vocabularyRole: 'revisit' });
    expect(draft.blocks.slice(1).map(b => b.blockKey)).toEqual(before.blocks.map(b => b.blockKey));

    // Students still see the published revision, without the new expression.
    const after = (await openLesson(world.student, target.story.id)).body;
    expect(after.revision).toBe(1);
    expect(after.blocks.some(b => b.vocabularyId === world.vocab.id)).toBe(false);

    // Publishing the target afterwards makes the expression visible to new students, first in "before".
    const published = await publishPlan(world.teacher, target.story.id, draft.blocks);
    expect(published.revision).toBe(2);
    const fresh = (await openLesson(world.student2, target.story.id)).body;
    expect(fresh.revision).toBe(2);
    expect(fresh.blocks[0]).toMatchObject({ type: 'expression', phase: 'before', vocabularyId: world.vocab.id, vocabularyRole: 'revisit' });
    expect(fresh.blocks[0].vocabulary).toMatchObject({ word: 'Me llamo' });
  });

  test('rejects a planned revisit without a target story, with the wrong role, or in a forbidden course', async () => {
    const source = await createStory(world, 'Origen');
    const { blocks } = standardBlocks({ vocab: world.vocab2, ...source });
    const draftOf = extra => as(world.teacher).get(`${planUrl(source.story.id)}/draft`).then(async d =>
      as(world.teacher).put(`${planUrl(source.story.id)}/draft`, { revision: d.body.revision, blocks: [...blocks, extra] }));
    const publish = revision => as(world.teacher).post(`${planUrl(source.story.id)}/publish`, { revision });

    // Missing target / wrong role are accepted as work in progress but refused when publishing.
    const noTarget = await draftOf({ blockKey: randomUUID(), type: 'expression', phase: 'later', vocabularyId: world.vocab.id, vocabularyRole: 'revisit' });
    expect(noTarget.status).toBe(200);
    expect((await publish(noTarget.body.revision)).status).toBe(422);

    const target = await createStory(world, 'Destino');
    const wrongRole = await draftOf({ blockKey: randomUUID(), type: 'expression', phase: 'later', vocabularyId: world.vocab.id, vocabularyRole: 'target', revisitStoryId: target.story.id });
    expect(wrongRole.status).toBe(200);
    expect((await publish(wrongRole.body.revision)).status).toBe(422);

    // A story from someone else's course is refused already when saving.
    expect((await draftOf(laterBlock(world.vocab.id, world.foreignStory.id))).status).toBe(400);

    // Nothing was staged anywhere, and nothing was published.
    expect(await LessonPlan.count({ where: { storyId: target.story.id } })).toBe(0);
    expect(await LessonPlan.count({ where: { storyId: world.foreignStory.id } })).toBe(0);
    expect(await LessonPlan.count({ where: { storyId: source.story.id, status: 'published' } })).toBe(0);
  });
});
