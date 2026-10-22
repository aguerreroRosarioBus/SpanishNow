// Draft editing: atomic reorder/validation and publishing rules.
const { randomUUID } = require('crypto');
const { Story, LessonPlan, LessonBlock } = require('../src/models');
const { as, createWorld, createStory, standardBlocks, planUrl, saveDraft, publishPlan, openLesson } = require('./helpers/fixtures');
const { draftTransaction, currentDraft } = require('../src/services/lessonPlanService');

describe('TPRS lesson plans: draft editing and publishing', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });

  const getDraft = storyId => as(world.teacher).get(`${planUrl(storyId)}/draft`);
  const is4xx = res => expect(res.status >= 400 && res.status < 500).toBe(true);

  /** A story whose draft already holds the standard blocks. */
  async function storyWithDraft() {
    const content = await createStory(world);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    const saved = await saveDraft(world.teacher, content.story.id, blocks);
    expect(saved.status).toBe(200);
    return { ...content, keys, blocks, draft: saved.body };
  }

  describe('concurrent drafts', () => {
    // Regression: under REPEATABLE READ, opening drafts of new stories at the same time deadlocked (500): both requests
    // locked the same gap of lesson_plan_story_revision while looking for a draft that did not exist, then both inserted.
    test('two new drafts created at the same time do not deadlock', async () => {
      const a = (await createStory(world, 'Concurrente A')).story;
      const b = (await createStory(world, 'Concurrente B')).story;
      // Hold both transactions right before their INSERT until both have looked for their draft: the interleaving that
      // deadlocked under REPEATABLE READ. A timeout releases the barrier if one of them is (correctly) made to wait.
      const create = LessonPlan.create.bind(LessonPlan);
      let arrived = 0;
      let release;
      const barrier = new Promise(resolve => { release = resolve; });
      const spy = jest.spyOn(LessonPlan, 'create').mockImplementation(async (...args) => {
        arrived += 1;
        if (arrived === 2) release();
        await Promise.race([barrier, new Promise(resolve => setTimeout(resolve, 2000))]);
        return create(...args);
      });
      try {
        const open = story => draftTransaction(async transaction => {
          await Story.findByPk(story.id, { transaction, lock: transaction.LOCK.UPDATE });
          return currentDraft(story, transaction);
        });
        const drafts = await Promise.all([open(a), open(b)]);
        expect(drafts.map(d => d.storyId)).toEqual([a.id, b.id]);
      } finally {
        spy.mockRestore();
      }
      expect(arrived).toBe(2);
      for (const story of [a, b]) expect(await LessonPlan.count({ where: { storyId: story.id, status: 'draft' } })).toBe(1);
    });

    test('opening the same new draft twice at once creates it once', async () => {
      const { story } = await createStory(world, 'Doble');
      const [a, b] = await Promise.all([getDraft(story.id), getDraft(story.id)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.revision).toBe(b.body.revision);
      expect(await LessonPlan.count({ where: { storyId: story.id, status: 'draft' } })).toBe(1);
    });
  });

  describe('atomic updates of the draft (PUT /draft)', () => {
    const put = (storyId, revision, blocks) => as(world.teacher).put(`${planUrl(storyId)}/draft`, { revision, blocks });

    test('a valid reorder is saved with unique, contiguous positions', async () => {
      const { story, draft, keys } = await storyWithDraft();
      // Move the second keyframe and its question to the beginning of "during".
      const byKey = Object.fromEntries(draft.blocks.map(b => [b.blockKey, b]));
      const reordered = [keys.exp, keys.k2, keys.q2, keys.k1, keys.q1, keys.full, keys.flash].map(k => byKey[k]);

      const res = await put(story.id, draft.revision, reordered.map(({ position, ...b }) => b));

      expect(res.status).toBe(200);
      expect(res.body.blocks.map(b => b.blockKey)).toEqual([keys.exp, keys.k2, keys.q2, keys.k1, keys.q1, keys.full, keys.flash]);
      expect(res.body.blocks.map(b => b.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    const invalidPayloads = {
      'duplicate positions': ({ blocks }) => blocks.map((b, i) => ({ ...b, position: i === 1 ? 0 : i })),
      'a gap in the positions': ({ blocks }) => blocks.map((b, i) => ({ ...b, position: i * 2 })),
      'a duplicated blockKey': ({ blocks }) => blocks.map((b, i) => (i === 3 ? { ...b, blockKey: blocks[1].blockKey } : b)),
      'a blockKey that is not a UUID': ({ blocks }) => blocks.map((b, i) => (i === 1 ? { ...b, blockKey: 'not-a-uuid' } : b)),
      'a question of another story': ({ blocks, other }) => blocks.map(b => (b === blocks.find(x => x.type === 'question') ? { ...b, questionId: other.q1.id } : b)),
      'a question that does not exist': ({ blocks }) => blocks.map(b => (b === blocks.find(x => x.type === 'question') ? { ...b, questionId: 99999999 } : b)),
      'an unknown phase': ({ blocks }) => blocks.map((b, i) => (i === 1 ? { ...b, phase: 'sometime' } : b)),
      'an unknown block type': ({ blocks }) => blocks.map((b, i) => (i === 1 ? { ...b, type: 'video' } : b)),
      'phases out of order': ({ blocks }) => [blocks[5], ...blocks.filter((_, i) => i !== 5)],
      'a block in a phase that does not allow its type': ({ blocks }) => blocks.map(b => (b.type === 'keyframe' ? { ...b, phase: 'after' } : b)),
      'a question placed before its keyframe': ({ blocks }) => { const c = [...blocks]; [c[1], c[2]] = [c[2], c[1]]; return c; },
      'a question whose context is not a keyframe': ({ blocks }) => blocks.map(b => (b.type === 'question' ? { ...b, contextBlockKey: randomUUID() } : b)),
      'more than 200 blocks': ({ blocks }) => Array.from({ length: 201 }, () => ({ ...blocks[1], blockKey: randomUUID() })),
      'blocks that are not an array': () => 'nope'
    };

    test.each(Object.keys(invalidPayloads))('rejects %s with 4xx and leaves the draft unchanged', async name => {
      const { story, draft, blocks } = await storyWithDraft();
      const other = await createStory(world);
      const payload = invalidPayloads[name]({ blocks: blocks.map((b, i) => ({ ...b, position: i })), other });

      const res = await put(story.id, draft.revision, payload);

      is4xx(res);
      expect((await getDraft(story.id)).body).toEqual(draft);
    });

    test('rejects a stale revision with 409 and leaves the draft unchanged', async () => {
      const { story, draft, blocks } = await storyWithDraft();
      const res = await put(story.id, draft.revision + 1, blocks);
      expect(res.status).toBe(409);
      expect((await getDraft(story.id)).body).toEqual(draft);
    });

    test('rejects a body that is not a JSON object', async () => {
      const { story } = await storyWithDraft();
      const res = await as(world.teacher).put(`${planUrl(story.id)}/draft`, []);
      expect(res.status).toBe(400);
    });

    test('a failure while writing the new blocks rolls back the deletion of the old ones', async () => {
      const { story, draft, blocks } = await storyWithDraft();
      // Passes every validation but the insert fails after the old blocks were deleted.
      const spy = jest.spyOn(LessonBlock, 'bulkCreate').mockRejectedValueOnce(new Error('simulated insert failure'));
      try {
        const res = await put(story.id, draft.revision, blocks);
        expect(res.status).toBe(500);
      } finally { spy.mockRestore(); }
      expect((await getDraft(story.id)).body).toEqual(draft);
      expect(await LessonBlock.count({ where: { planId: draft.id } })).toBe(blocks.length);
    });

    describe('field length limits (400 with a clear message, draft unchanged)', () => {
      const withKeyframe = (blocks, patch) => blocks.map(b => (b.type === 'keyframe' && b.text === 'María va a una fiesta.' ? { ...b, ...patch } : b));
      const cases = {
        'keyframe text over 20000 characters': [{ text: 'a'.repeat(20001) }, /20000/],
        'keyframe text over 20000 characters counted in UTF-16 units': [{ text: '\u{1F600}'.repeat(10001) }, /20000/],
        'a non-string keyframe text': [{ text: 12345 }, /text/],
        'audioUrl over 500 characters': [{ audioUrl: `https://cdn.example.com/${'a'.repeat(500)}.mp3` }, /audioUrl/],
        'a non-string audioUrl': [{ audioUrl: { url: 'x' } }, /audioUrl/]
      };
      test.each(Object.keys(cases))('rejects %s', async name => {
        const { story, draft, blocks } = await storyWithDraft();
        const [patch, message] = cases[name];
        const res = await put(story.id, draft.revision, withKeyframe(blocks, patch));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(message);
        expect((await getDraft(story.id)).body).toEqual(draft);
      });

      test('rejects an id that is not a positive integer', async () => {
        const { story, draft, blocks } = await storyWithDraft();
        const res = await put(story.id, draft.revision, blocks.map(b => (b.type === 'question' ? { ...b, questionId: 'abc' } : b)));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/questionId/);
      });

      test('accepts keyframe text of exactly 20000 characters and a 500-character audioUrl', async () => {
        const { story, draft, blocks } = await storyWithDraft();
        const audioUrl = `https://cdn.example.com/${'a'.repeat(500 - 'https://cdn.example.com/'.length)}`;
        const res = await put(story.id, draft.revision, withKeyframe(blocks, { text: 'a'.repeat(20000), audioUrl }));
        expect(res.status).toBe(200);
      });
    });
  });

  describe('dedicated reorder endpoint (PUT /draft/reorder)', () => {
    const reorder = (storyId, revision, blockKeys) => as(world.teacher).put(`${planUrl(storyId)}/draft/reorder`, { revision, blockKeys });

    test('a valid order is applied atomically with contiguous positions', async () => {
      const { story, draft, keys } = await storyWithDraft();
      const order = [keys.exp, keys.k2, keys.q2, keys.k1, keys.q1, keys.full, keys.flash];

      const res = await reorder(story.id, draft.revision, order);

      expect(res.status).toBe(200);
      expect(res.body.blocks.map(b => b.blockKey)).toEqual(order);
      expect(res.body.blocks.map(b => b.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect((await getDraft(story.id)).body.blocks.map(b => b.blockKey)).toEqual(order);
    });

    test('rejects an order with duplicates, missing or unknown keys, and keeps the draft', async () => {
      const { story, draft } = await storyWithDraft();
      const all = draft.blocks.map(b => b.blockKey);
      const attempts = [
        [...all.slice(0, -1), all[0]], // duplicate
        all.slice(0, -1), // missing one
        [...all.slice(0, -1), randomUUID()], // unknown
        [...all, randomUUID()], // extra
        'nope'
      ];
      for (const attempt of attempts) {
        const res = await reorder(story.id, draft.revision, attempt);
        is4xx(res);
      }
      expect((await getDraft(story.id)).body).toEqual(draft);
    });

    test('rejects an order that moves a question before its keyframe or breaks the phases', async () => {
      const { story, draft, keys } = await storyWithDraft();
      const questionFirst = [keys.exp, keys.q1, keys.k1, keys.k2, keys.q2, keys.full, keys.flash];
      const fullStoryFirst = [keys.full, keys.exp, keys.k1, keys.q1, keys.k2, keys.q2, keys.flash];

      is4xx(await reorder(story.id, draft.revision, questionFirst));
      is4xx(await reorder(story.id, draft.revision, fullStoryFirst));
      expect((await getDraft(story.id)).body).toEqual(draft);
    });

    test('rejects a stale revision', async () => {
      const { story, draft } = await storyWithDraft();
      const res = await reorder(story.id, draft.revision + 5, draft.blocks.map(b => b.blockKey));
      expect(res.status).toBe(409);
    });
  });

  describe('publishing', () => {
    const publish = (storyId, revision) => as(world.teacher).post(`${planUrl(storyId)}/publish`, { revision });

    test('requires at least one active keyframe', async () => {
      const content = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.vocab, ...content });
      // Keep the questions' structure valid but disable every keyframe, and drop the questions that need them.
      const noKeyframes = blocks.filter(b => b.type !== 'question').map(b => (b.type === 'keyframe' ? { ...b, active: false } : b));
      const saved = await saveDraft(world.teacher, content.story.id, noKeyframes);
      expect(saved.status).toBe(200);

      const res = await publish(content.story.id, saved.body.revision);

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/keyframe/i);
      expect(await LessonPlan.count({ where: { storyId: content.story.id, status: 'published' } })).toBe(0);
      expect((await getDraft(content.story.id)).body.status).toBe('draft');
      expect((await openLesson(world.student, content.story.id)).status).toBe(404);
    });

    test('requires at least one keyframe even when the draft has none', async () => {
      const content = await createStory(world);
      const onlyFull = [{ blockKey: randomUUID(), type: 'full_story', phase: 'after' }];
      const saved = await saveDraft(world.teacher, content.story.id, onlyFull);
      expect(saved.status).toBe(200);
      expect((await publish(content.story.id, saved.body.revision)).status).toBe(422);
    });

    test('requires text in active keyframes, exactly one full_story, and context for questions', async () => {
      const content = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.vocab, ...content });
      const variants = {
        'a blank keyframe': blocks.map(b => (b.type === 'keyframe' ? { ...b, text: '   ' } : b)),
        'no full_story': blocks.filter(b => b.type !== 'full_story'),
        'two full_story': [...blocks, { blockKey: randomUUID(), type: 'full_story', phase: 'after' }],
        'a question without context': blocks.map(b => (b.type === 'question' ? { ...b, contextBlockKey: undefined } : b)),
        'a question without questionId': blocks.map(b => (b.type === 'question' ? { ...b, questionId: undefined } : b)),
        'a later expression without revisit story': [...blocks, { blockKey: randomUUID(), type: 'expression', phase: 'later', vocabularyId: world.vocab2.id, vocabularyRole: 'revisit' }]
      };
      for (const variant of Object.values(variants)) {
        const saved = await saveDraft(world.teacher, content.story.id, variant);
        if (saved.status !== 200) { is4xx(saved); continue; } // already refused while saving the draft
        const res = await publish(content.story.id, saved.body.revision);
        expect([422, 400]).toContain(res.status);
        expect(await LessonPlan.count({ where: { storyId: content.story.id, status: 'published' } })).toBe(0);
      }
    });

    test('derives Story.text from the active keyframes, in order', async () => {
      const content = await createStory(world);
      const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
      const withHidden = blocks.map(b => (b.blockKey === keys.k2 ? { ...b, text: '  María ve a Juan.  ' } : b));
      withHidden.splice(5, 0, { blockKey: randomUUID(), type: 'keyframe', phase: 'during', text: 'Fragmento desactivado.', active: false });
      expect((await Story.findByPk(content.story.id)).text).toBe('Texto original de la historia.');

      const published = await publishPlan(world.teacher, content.story.id, withHidden);

      expect(published.status).toBe('published');
      expect((await Story.findByPk(content.story.id)).text).toBe('María va a una fiesta.\n\nMaría ve a Juan.');
      const lesson = (await openLesson(world.student, content.story.id)).body;
      expect(lesson.story.fullStoryText).toBe('María va a una fiesta.\n\nMaría ve a Juan.');
    });

    test('snapshots the question and vocabulary content at publish time', async () => {
      const content = await createStory(world);
      const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
      const published = await publishPlan(world.teacher, content.story.id, blocks);
      expect(published.blocks.find(b => b.blockKey === keys.q1).questionSnapshot).toMatchObject({ questionText: '¿Dónde está María?', correctAnswer: 'En la fiesta' });
      expect(published.blocks.find(b => b.blockKey === keys.exp).vocabularySnapshot).toMatchObject({ word: 'Me llamo', translation: 'My name is' });
    });

    test('returns 201 with the next revision and leaves no draft behind; publishing again needs a new draft', async () => {
      const content = await createStory(world);
      const { blocks } = standardBlocks({ vocab: world.vocab, ...content });
      const first = await publishPlan(world.teacher, content.story.id, blocks);
      expect(first.revision).toBe(1);

      const again = await publish(content.story.id, first.revision);
      expect(again.status).toBe(404);

      const next = await getDraft(content.story.id);
      expect(next.body.revision).toBe(2);
      expect(next.body.status).toBe('draft');
      expect(next.body.blocks.map(b => b.blockKey)).toEqual(first.blocks.map(b => b.blockKey));
    });

    test('rejects a stale draft revision', async () => {
      const { story, draft } = await storyWithDraft();
      expect((await publish(story.id, draft.revision + 1)).status).toBe(409);
      expect((await getDraft(story.id)).body.status).toBe('draft');
    });
  });
});
