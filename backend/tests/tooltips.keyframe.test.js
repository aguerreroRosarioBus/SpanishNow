// Tooltips anchored to keyframes (blockKey + offsets relative to the keyframe text).
const { Tooltip } = require('../src/models');
const { as, createWorld, createStory, standardBlocks, planUrl, saveDraft, publishPlan, openLesson } = require('./helpers/fixtures');

describe('Keyframe tooltips', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  const K1 = 'María va a una fiesta.';
  const getDraft = storyId => as(world.teacher).get(`${planUrl(storyId)}/draft`);
  const draftBlock = async (storyId, key) => (await getDraft(storyId)).body.blocks.find(b => b.blockKey === key);
  const create = (user, body) => as(user).post('/api/tooltips', body);
  const keyframeBody = (story, blockKey, text, start, end, extra = {}) => ({
    targetType: 'keyframe', targetId: story.id, blockKey, startOffset: start, endOffset: end,
    selectedText: text.slice(start, end), tooltipContent: 'Maria (name)', ...extra
  });

  async function storyWithDraft() {
    const content = await createStory(world);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    const saved = await saveDraft(world.teacher, content.story.id, blocks);
    expect(saved.status).toBe(200);
    return { ...content, keys, blocks, draft: saved.body };
  }

  /** Edits the text of keyframes in the current draft and returns the saved draft. */
  async function editDraft(storyId, texts) {
    const draft = (await getDraft(storyId)).body;
    const blocks = draft.blocks.map(({ position, tooltips, ...b }) => (texts[b.blockKey] ? { ...b, text: texts[b.blockKey] } : b));
    const res = await as(world.teacher).put(`${planUrl(storyId)}/draft`, { revision: draft.revision, blocks });
    expect(res.status).toBe(200);
    return res.body;
  }
  const publish = async storyId => {
    const draft = (await getDraft(storyId)).body;
    const res = await as(world.teacher).post(`${planUrl(storyId)}/publish`, { revision: draft.revision });
    expect(res.status).toBe(201);
    return res.body;
  };

  describe('POST /api/tooltips with targetType=keyframe', () => {
    test('creates a tooltip relative to the keyframe text and lists it in the draft', async () => {
      const { story, keys } = await storyWithDraft();

      const res = await create(world.teacher, keyframeBody(story, keys.k1, K1, 0, 5));

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ targetType: 'keyframe', targetId: story.id, blockKey: keys.k1, startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'Maria (name)', isActive: true });
      const second = await create(world.teacher, keyframeBody(story, keys.k1, K1, 11, 21, { tooltipContent: 'party' }));
      expect(second.status).toBe(201);

      const k1 = await draftBlock(story.id, keys.k1);
      expect(k1.tooltips).toEqual([
        { id: res.body.id, startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'Maria (name)', isActive: true },
        { id: second.body.id, startOffset: 11, endOffset: 21, selectedText: 'una fiesta', tooltipContent: 'party', isActive: true }
      ]);
      expect((await draftBlock(story.id, keys.k2)).tooltips).toEqual([]);
      expect((await draftBlock(story.id, keys.q1)).tooltips).toBeUndefined();
    });

    test('rejects selected text that does not match the keyframe text at those offsets (400)', async () => {
      const { story, keys } = await storyWithDraft();
      const res = await create(world.teacher, { ...keyframeBody(story, keys.k1, K1, 0, 5), selectedText: 'Maria' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/does not match/i);
      // Offsets taken from another keyframe's text do not match this one.
      expect((await create(world.teacher, { ...keyframeBody(story, keys.k1, 'María ve a Juan.', 9, 14) })).status).toBe(400);
      expect(await Tooltip.count({ where: { targetType: 'keyframe', targetId: story.id } })).toBe(0);
    });

    test('rejects invalid offsets, a missing blockKey and bad types (400)', async () => {
      const { story, keys } = await storyWithDraft();
      const ok = keyframeBody(story, keys.k1, K1, 0, 5);
      for (const patch of [{ startOffset: -1 }, { startOffset: 5, endOffset: 5 }, { startOffset: 1.5 }, { startOffset: '0' },
        { blockKey: undefined }, { blockKey: 'x'.repeat(65) }, { targetType: 'paragraph' }, { endOffset: 9999, selectedText: 'x' }]) {
        const res = await create(world.teacher, { ...ok, ...patch });
        expect(res.status).toBe(400);
      }
    });

    test('only the course owner can create (403); students and anonymous users cannot', async () => {
      const { story, keys } = await storyWithDraft();
      const body = keyframeBody(story, keys.k1, K1, 0, 5);
      expect((await create(world.otherTeacher, body)).status).toBe(403);
      expect((await create(world.student, body)).status).toBe(403);
      expect((await create(null, body)).status).toBe(401);
      expect(await Tooltip.count({ where: { targetType: 'keyframe', targetId: story.id } })).toBe(0);
    });

    test('the block must exist in the draft (404) and be a keyframe (400); the story must exist (404)', async () => {
      const { story, keys } = await storyWithDraft();
      const body = keyframeBody(story, keys.k1, K1, 0, 5);
      expect((await create(world.teacher, { ...body, blockKey: '11111111-1111-4111-8111-111111111111' })).status).toBe(404);
      expect((await create(world.teacher, { ...body, blockKey: keys.q1 })).status).toBe(400);
      expect((await create(world.teacher, { ...body, blockKey: keys.full })).status).toBe(400);
      expect((await create(world.teacher, { ...body, targetId: 99999999 })).status).toBe(404);
    });

    test('a story without draft cannot get keyframe tooltips (404)', async () => {
      const content = await createStory(world);
      const res = await create(world.teacher, keyframeBody(content.story, '11111111-1111-4111-8111-111111111111', K1, 0, 5));
      expect(res.status).toBe(404);
    });

    test('overlap is rejected within the same keyframe (409) but allowed across keyframes and when adjacent', async () => {
      const { story, keys } = await storyWithDraft();
      expect((await create(world.teacher, keyframeBody(story, keys.k1, K1, 0, 5))).status).toBe(201);
      for (const [start, end] of [[0, 5], [2, 8], [3, 4], [0, 10], [-0, 6]]) {
        const res = await create(world.teacher, keyframeBody(story, keys.k1, K1, start, end));
        expect(res.status).toBe(409);
        expect(res.body.conflicting).toHaveLength(1);
      }
      // adjacent, and the same offsets in another keyframe
      expect((await create(world.teacher, keyframeBody(story, keys.k1, K1, 5, 8))).status).toBe(201);
      expect((await create(world.teacher, keyframeBody(story, keys.k2, 'María ve a Juan.', 0, 5))).status).toBe(201);
    });

    test('rejects oversized tooltipContent and selectedText (400)', async () => {
      const { story, keys } = await storyWithDraft();
      const body = keyframeBody(story, keys.k1, K1, 0, 5);
      const tooMuch = await create(world.teacher, { ...body, tooltipContent: 'x'.repeat(2001) });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.error).toMatch(/tooltipContent/);
      const longSelection = await create(world.teacher, { ...body, selectedText: 'x'.repeat(1001) });
      expect(longSelection.status).toBe(400);
      expect(longSelection.body.error).toMatch(/selectedText/);
      expect((await create(world.teacher, { ...body, tooltipContent: 'x'.repeat(2000) })).status).toBe(201);
    });
  });

  describe('PUT/DELETE /api/tooltips/:id on a keyframe tooltip', () => {
    async function withTooltip() {
      const ctx = await storyWithDraft();
      const tooltip = (await create(world.teacher, keyframeBody(ctx.story, ctx.keys.k1, K1, 0, 5))).body;
      return { ...ctx, tooltip };
    }

    test('the owner updates the content and deletes it', async () => {
      const { story, keys, tooltip } = await withTooltip();

      const updated = await as(world.teacher).put(`/api/tooltips/${tooltip.id}`, { tooltipContent: 'Mary', highlightColor: 'blue' });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ tooltipContent: 'Mary', highlightColor: 'blue', startOffset: 0, endOffset: 5 });
      expect((await draftBlock(story.id, keys.k1)).tooltips[0].tooltipContent).toBe('Mary');

      const deleted = await as(world.teacher).delete(`/api/tooltips/${tooltip.id}`);
      expect(deleted.status).toBe(200);
      expect((await draftBlock(story.id, keys.k1)).tooltips).toEqual([]);
    });

    test('other teachers (403), students (403) and anonymous users (401) cannot change it', async () => {
      const { tooltip } = await withTooltip();
      for (const [user, status] of [[world.otherTeacher, 403], [world.student, 403], [null, 401]]) {
        expect((await as(user).put(`/api/tooltips/${tooltip.id}`, { tooltipContent: 'hack' })).status).toBe(status);
        expect((await as(user).delete(`/api/tooltips/${tooltip.id}`)).status).toBe(status);
      }
      expect((await Tooltip.findByPk(tooltip.id)).tooltipContent).toBe('Maria (name)');
    });

    test('rejects an oversized tooltipContent on update (400)', async () => {
      const { tooltip } = await withTooltip();
      expect((await as(world.teacher).put(`/api/tooltips/${tooltip.id}`, { tooltipContent: 'x'.repeat(2001) })).status).toBe(400);
      expect((await as(world.teacher).put(`/api/tooltips/${tooltip.id}`, { tooltipContent: '   ' })).status).toBe(400);
    });
  });

  describe('student API and publishing', () => {
    test('the student receives only { startOffset, endOffset, selectedText, tooltipContent } of active tooltips, on keyframes only', async () => {
      const { story, keys, blocks } = await storyWithDraft();
      const t1 = (await create(world.teacher, keyframeBody(story, keys.k1, K1, 0, 5))).body;
      const t2 = (await create(world.teacher, keyframeBody(story, keys.k1, K1, 11, 21, { tooltipContent: 'party' }))).body;
      await Tooltip.update({ isActive: false }, { where: { id: t2.id } });
      expect(t1.id).toBeDefined();
      await publish(story.id);

      const lesson = (await openLesson(world.student, story.id)).body;

      expect(lesson.blocks.find(b => b.blockKey === keys.k1).tooltips).toEqual([
        { startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'Maria (name)' }
      ]);
      expect(lesson.blocks.find(b => b.blockKey === keys.k2).tooltips).toEqual([]);
      expect(lesson.blocks.filter(b => b.type !== 'keyframe').every(b => b.tooltips === undefined)).toBe(true);
      expect(blocks.length).toBe(lesson.blocks.length);
    });

    test('publishing deactivates the tooltips that no longer match the keyframe text and keeps the others', async () => {
      const { story, keys } = await storyWithDraft();
      const stays = (await create(world.teacher, keyframeBody(story, keys.k1, K1, 11, 21))).body;
      const breaks = (await create(world.teacher, keyframeBody(story, keys.k1, K1, 0, 5))).body;
      const gone = (await create(world.teacher, keyframeBody(story, keys.k2, 'María ve a Juan.', 0, 5))).body;
      // Draft edits: the start of k1 changes; k2 is disabled altogether.
      const draft = (await getDraft(story.id)).body;
      const blocks = draft.blocks.map(({ position, tooltips, ...b }) => {
        if (b.blockKey === keys.k1) return { ...b, text: 'Pedro va a una fiesta.' };
        return b;
      }).filter(b => ![keys.k2, keys.q2].includes(b.blockKey));
      expect((await as(world.teacher).put(`${planUrl(story.id)}/draft`, { revision: draft.revision, blocks })).status).toBe(200);

      const published = await publish(story.id);

      const states = Object.fromEntries((await Tooltip.findAll({ where: { targetType: 'keyframe', targetId: story.id } })).map(t => [t.id, t.isActive]));
      expect(states).toEqual({ [stays.id]: true, [breaks.id]: false, [gone.id]: false });
      // The publish response already reports the final state.
      expect(published.blocks.find(b => b.blockKey === keys.k1).tooltips.map(t => [t.id, t.isActive])).toEqual([[breaks.id, false], [stays.id, true]]);
      const lesson = (await openLesson(world.student, story.id)).body;
      expect(lesson.blocks.find(b => b.blockKey === keys.k1).tooltips.map(t => t.selectedText)).toEqual(['una fiesta']);
    });

    test('the blockKey is stable across revisions: a tooltip that still matches is shown to students of both revisions', async () => {
      const { story, keys } = await storyWithDraft();
      await create(world.teacher, keyframeBody(story, keys.k1, K1, 0, 5));
      await publish(story.id);
      const old = (await openLesson(world.student, story.id)).body;
      expect(old.revision).toBe(1);

      await editDraft(story.id, { [keys.k1]: 'María va a una fiesta grande.' });
      await publish(story.id);

      const pinned = (await openLesson(world.student, story.id)).body;
      const fresh = (await openLesson(world.student2, story.id)).body;
      expect([pinned.revision, fresh.revision]).toEqual([1, 2]);
      for (const lesson of [pinned, fresh]) {
        expect(lesson.blocks.find(b => b.blockKey === keys.k1).tooltips.map(t => t.selectedText)).toEqual(['María']);
      }
    });

    test('a student pinned to an old revision does not receive a tooltip that only matches the new text', async () => {
      const { story, keys } = await storyWithDraft();
      await publish(story.id); // revision 1: 'María va a una fiesta.'
      const pinned = (await openLesson(world.student, story.id)).body;
      expect(pinned.revision).toBe(1);

      // Revision 2 shifts the offsets: 'Ana y María van a la fiesta.'
      const NEW_TEXT = 'Ana y María van a la fiesta.';
      await editDraft(story.id, { [keys.k1]: NEW_TEXT });
      const tooltip = (await create(world.teacher, keyframeBody(story, keys.k1, NEW_TEXT, 6, 11))).body;
      expect(tooltip.selectedText).toBe('María');
      await publish(story.id);

      expect((await Tooltip.findByPk(tooltip.id)).isActive).toBe(true);
      const fresh = (await openLesson(world.student2, story.id)).body;
      expect(fresh.revision).toBe(2);
      expect(fresh.blocks.find(b => b.blockKey === keys.k1).tooltips).toEqual([
        { startOffset: 6, endOffset: 11, selectedText: 'María', tooltipContent: 'Maria (name)' }
      ]);
      const stillOld = (await openLesson(world.student, story.id)).body;
      expect(stillOld.revision).toBe(1);
      expect(stillOld.blocks.find(b => b.blockKey === keys.k1).text).toBe(K1);
      expect(stillOld.blocks.find(b => b.blockKey === keys.k1).tooltips).toEqual([]);
    });
  });

  describe('legacy story/question tooltips keep working', () => {
    test('story tooltip: create, overlap 409, ownership and validate', async () => {
      const { story } = await createStory(world); // text: 'Texto original de la historia.'
      const body = { targetType: 'story', targetId: story.id, startOffset: 0, endOffset: 5, selectedText: 'Texto', tooltipContent: 'Text' };
      const created = await create(world.teacher, body);
      expect(created.status).toBe(201);
      expect(created.body.blockKey).toBeNull();
      expect((await create(world.teacher, { ...body, startOffset: 2, endOffset: 4, selectedText: 'xt' })).status).toBe(409);
      expect((await create(world.otherTeacher, body)).status).toBe(403);
      expect((await as(world.otherTeacher).post('/api/tooltips/validate', { targetType: 'story', targetId: story.id })).status).toBe(403);
      const validated = await as(world.teacher).post('/api/tooltips/validate', { targetType: 'story', targetId: story.id });
      expect(validated.body).toMatchObject({ totalTooltips: 1, validTooltips: 1 });
      expect((await as(world.teacher).delete(`/api/tooltips/${created.body.id}`)).status).toBe(200);
    });

    test('question tooltip: create and ownership', async () => {
      const { q1 } = await createStory(world);
      const body = { targetType: 'question', targetId: q1.id, startOffset: 1, endOffset: 6, selectedText: 'Dónde', tooltipContent: 'Where' };
      expect((await create(world.otherTeacher, body)).status).toBe(403);
      expect((await create(world.teacher, body)).status).toBe(201);
    });
  });
});
