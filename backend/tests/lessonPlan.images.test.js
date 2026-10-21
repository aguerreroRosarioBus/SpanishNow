// Keyframe illustrations: upload/removal on the draft, imageAlt on the draft PUT, publishing and the student payload.
// Cloudinary is always mocked; nothing is uploaded.
jest.mock('../src/config/cloudinary', () => ({ uploadFromBuffer: jest.fn() }));

const request = require('supertest');
const { Vocabulary } = require('../src/models');
const cloudinary = require('../src/config/cloudinary');
const sequelize = require('../src/config/database');
const migration = require('../migrations/20261023000000-add-keyframe-images');
const { app, as, createWorld, createStory, standardBlocks, planUrl, saveDraft, publishPlan, openLesson } = require('./helpers/fixtures');

const URL1 = 'https://res.cloudinary.test/spanishnow/keyframes/images/k1.png';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('TPRS lesson plans: keyframe images', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });
  beforeEach(() => {
    cloudinary.uploadFromBuffer.mockReset();
    cloudinary.uploadFromBuffer.mockResolvedValue({ secure_url: URL1 });
  });

  async function storyWithDraft(vocab = world.vocab) {
    const content = await createStory(world);
    const { blocks, keys } = standardBlocks({ vocab, ...content });
    const saved = await saveDraft(world.teacher, content.story.id, blocks);
    expect(saved.status).toBe(200);
    return { ...content, keys, blocks, draft: saved.body };
  }

  const imageUrl = (storyId, blockKey) => `${planUrl(storyId)}/draft/blocks/${blockKey}/image`;
  const getDraft = storyId => as(world.teacher).get(`${planUrl(storyId)}/draft`);
  const blockOf = async (storyId, key) => (await getDraft(storyId)).body.blocks.find(b => b.blockKey === key);
  const upload = (user, storyId, blockKey, { field = 'image', name = 'draw.png', type = 'image/png', content = PNG } = {}) => {
    const req = request(app).post(imageUrl(storyId, blockKey));
    if (user) req.set('Authorization', `Bearer ${user.token}`);
    return req.attach(field, content, { filename: name, contentType: type });
  };
  // Re-saves the draft the way the editor does: the blocks as returned by the server, with changes applied.
  const resave = async (storyId, change) => {
    const draft = (await getDraft(storyId)).body;
    const blocks = draft.blocks.map(({ position, ...b }) => change(b));
    return as(world.teacher).put(`${planUrl(storyId)}/draft`, { revision: draft.revision, blocks });
  };

  test('the owner uploads an image to a keyframe: stored in the draft and returned', async () => {
    const { story, keys } = await storyWithDraft();

    const res = await upload(world.teacher, story.id, keys.k1);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ blockKey: keys.k1, imageUrl: URL1 });
    expect(cloudinary.uploadFromBuffer).toHaveBeenCalledTimes(1);
    const [buffer, options] = cloudinary.uploadFromBuffer.mock.calls[0];
    expect(buffer.equals(PNG)).toBe(true);
    expect(options).toMatchObject({ folder: 'spanishnow/keyframes/images', resource_type: 'image' });
    expect((await blockOf(story.id, keys.k1)).imageUrl).toBe(URL1);
    expect((await blockOf(story.id, keys.k2)).imageUrl).toBeNull();
  });

  test.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('accepts %s', async type => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1, { type, name: 'x.img' })).status).toBe(200);
  });

  test('other types, SVG, audio and a missing or misnamed field get 400 and upload nothing', async () => {
    const { story, keys } = await storyWithDraft();
    for (const type of ['image/svg+xml', 'image/bmp', 'application/pdf', 'audio/mpeg', 'text/html']) {
      const res = await upload(world.teacher, story.id, keys.k1, { type, name: 'x.bin' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PNG, JPEG, WebP or GIF/);
    }
    expect((await as(world.teacher).post(imageUrl(story.id, keys.k1), {})).status).toBe(400);
    expect((await upload(world.teacher, story.id, keys.k1, { field: 'file' })).status).toBe(400);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
    expect((await blockOf(story.id, keys.k1)).imageUrl).toBeNull();
  });

  test('a file over 5 MB gets 413 with a clear message; exactly within the limit is accepted', async () => {
    const { story, keys } = await storyWithDraft();
    const big = await upload(world.teacher, story.id, keys.k1, { content: Buffer.alloc(5 * 1024 * 1024 + 1) });
    expect(big.status).toBe(413);
    expect(big.body.error).toMatch(/5 MB/);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
    expect((await upload(world.teacher, story.id, keys.k1, { content: Buffer.alloc(5 * 1024 * 1024) })).status).toBe(200);
  });

  test('a block that is not a keyframe gets 400; a missing one gets 404', async () => {
    const { story, keys } = await storyWithDraft();
    for (const key of [keys.q1, keys.full, keys.exp]) {
      expect((await upload(world.teacher, story.id, key)).status).toBe(400);
      expect((await as(world.teacher).delete(imageUrl(story.id, key))).status).toBe(400);
    }
    const missing = '11111111-1111-4111-8111-111111111111';
    expect((await upload(world.teacher, story.id, missing)).status).toBe(404);
    expect((await as(world.teacher).delete(imageUrl(story.id, missing))).status).toBe(404);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
  });

  test('another teacher gets 403, students 403 and anonymous 401; nothing is uploaded', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.otherTeacher, story.id, keys.k1)).status).toBe(403);
    expect((await upload(world.student, story.id, keys.k1)).status).toBe(403);
    expect((await upload(null, story.id, keys.k1)).status).toBe(401);
    expect((await as(world.otherTeacher).delete(imageUrl(story.id, keys.k1))).status).toBe(403);
    expect((await as(world.student).delete(imageUrl(story.id, keys.k1))).status).toBe(403);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
    expect((await blockOf(story.id, keys.k1)).imageUrl).toBeNull();
  });

  test('a Cloudinary failure or unusable answer returns 502 and leaves the block untouched', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);
    cloudinary.uploadFromBuffer.mockRejectedValueOnce(new Error('cloudinary down'));
    const res = await upload(world.teacher, story.id, keys.k1);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/upload failed/i);
    cloudinary.uploadFromBuffer.mockResolvedValueOnce({});
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(502);
    cloudinary.uploadFromBuffer.mockResolvedValueOnce({ secure_url: `https://x.test/${'a'.repeat(500)}` });
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(502);
    expect((await blockOf(story.id, keys.k1)).imageUrl).toBe(URL1);
  });

  test('DELETE clears imageUrl and answers { blockKey, imageUrl: null }, idempotently', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);

    const res = await as(world.teacher).delete(imageUrl(story.id, keys.k1));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ blockKey: keys.k1, imageUrl: null });
    expect((await blockOf(story.id, keys.k1)).imageUrl).toBeNull();
    expect((await as(world.teacher).delete(imageUrl(story.id, keys.k1))).status).toBe(200);
  });

  test('imageAlt is saved with the draft; imageUrl in the body is ignored but an existing one survives the save', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);

    const saved = await resave(story.id, b => b.blockKey === keys.k1
      ? { ...b, imageAlt: '  María en la fiesta  ', imageUrl: 'javascript:alert(1)' }
      : { ...b, imageUrl: 'https://evil.test/x.png' });

    expect(saved.status).toBe(200);
    const k1 = saved.body.blocks.find(b => b.blockKey === keys.k1);
    expect(k1.imageUrl).toBe(URL1);
    expect(k1.imageAlt).toBe('María en la fiesta');
    expect(saved.body.blocks.find(b => b.blockKey === keys.k2).imageUrl).toBeNull();
    expect(saved.body.blocks.find(b => b.blockKey === keys.q1).imageUrl).toBeNull();
    // Blank alt text is stored as null
    const cleared = await resave(story.id, b => b.blockKey === keys.k1 ? { ...b, imageAlt: '   ' } : b);
    expect(cleared.body.blocks.find(b => b.blockKey === keys.k1)).toMatchObject({ imageUrl: URL1, imageAlt: null });
  });

  test('imageAlt must be a string of at most 300 characters; other block types always store null', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await resave(story.id, b => b.blockKey === keys.k1 ? { ...b, imageAlt: 'a'.repeat(301) } : b)).status).toBe(400);
    expect((await resave(story.id, b => b.blockKey === keys.k1 ? { ...b, imageAlt: 42 } : b)).status).toBe(400);
    expect((await resave(story.id, b => b.blockKey === keys.k1 ? { ...b, imageAlt: 'a'.repeat(300) } : b)).status).toBe(200);
    const other = await resave(story.id, b => b.blockKey === keys.q1 ? { ...b, imageAlt: 'no aplica' } : b);
    expect(other.status).toBe(200);
    expect(other.body.blocks.find(b => b.blockKey === keys.q1).imageAlt).toBeNull();
  });

  test('publishing keeps imageUrl/imageAlt, the student receives them and the next draft starts from them', async () => {
    const { story, keys, draft } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);
    expect((await resave(story.id, b => b.blockKey === keys.k1 ? { ...b, imageAlt: 'Una fiesta' } : b)).status).toBe(200);
    const revision = (await getDraft(story.id)).body.revision;
    expect(revision).toBe(draft.revision);

    const published = await as(world.teacher).post(`${planUrl(story.id)}/publish`, { revision });

    expect(published.status).toBe(201);
    expect(published.body.blocks.find(b => b.blockKey === keys.k1)).toMatchObject({ imageUrl: URL1, imageAlt: 'Una fiesta' });
    const lesson = (await openLesson(world.student, story.id)).body;
    expect(lesson.blocks.find(b => b.blockKey === keys.k1)).toMatchObject({ imageUrl: URL1, imageAlt: 'Una fiesta' });
    expect(lesson.blocks.find(b => b.blockKey === keys.k2)).toMatchObject({ imageUrl: null, imageAlt: null });
    // The next draft is a new revision copied from the published blocks, images included.
    const next = (await getDraft(story.id)).body;
    expect(next.revision).toBe(revision + 1);
    expect(next.blocks.find(b => b.blockKey === keys.k1)).toMatchObject({ imageUrl: URL1, imageAlt: 'Una fiesta' });
  });

  test('uploading or deleting after publishing modifies only the new draft, never the published revision', async () => {
    const { story, keys, blocks } = await storyWithDraft();
    await publishPlan(world.teacher, story.id, blocks);

    const res = await upload(world.teacher, story.id, keys.k1);
    expect(res.status).toBe(200);
    expect((await openLesson(world.student, story.id)).body.blocks.find(b => b.blockKey === keys.k1).imageUrl).toBeNull();
    expect((await blockOf(story.id, keys.k1)).imageUrl).toBe(URL1);

    const republished = await publishPlan(world.teacher, story.id, (await getDraft(story.id)).body.blocks);
    expect(republished.blocks.find(b => b.blockKey === keys.k1).imageUrl).toBe(URL1);
    // Revision 1 stays as students were given it until a new draft is published and they restart.
    expect((await as(world.teacher).delete(imageUrl(story.id, keys.k1))).status).toBe(200);
    expect((await openLesson(world.student, story.id)).body.blocks.find(b => b.blockKey === keys.k1).imageUrl).toBeNull();
  });

  test('the student payload of an expression block carries the vocabulary imageUrl', async () => {
    const vocab = await Vocabulary.create({ unitId: world.unit.id, word: 'La fiesta', translation: 'The party',
      imageUrl: 'https://res.cloudinary.test/spanishnow/vocabulary/images/party.png' });
    const { story, keys, blocks } = await storyWithDraft(vocab);
    await publishPlan(world.teacher, story.id, blocks);

    const lesson = (await openLesson(world.student, story.id)).body;

    const expression = lesson.blocks.find(b => b.blockKey === keys.exp);
    expect(expression.vocabulary.imageUrl).toBe('https://res.cloudinary.test/spanishnow/vocabulary/images/party.png');
    expect(expression.vocabularySnapshot).toBeUndefined();
  });

  describe('migration 20261023000000-add-keyframe-images', () => {
    test('the migrated test database has both columns', async () => {
      const columns = await sequelize.getQueryInterface().describeTable('lesson_blocks');
      expect(columns.imageUrl).toMatchObject({ type: 'VARCHAR(500)', allowNull: true });
      expect(columns.imageAlt).toMatchObject({ type: 'VARCHAR(300)', allowNull: true });
    });

    test('down refuses to drop stored illustrations without confirmation, and drops the columns with it', async () => {
      const fakeQi = total => ({
        describeTable: jest.fn().mockResolvedValue({ imageUrl: {}, imageAlt: {} }),
        removeColumn: jest.fn().mockResolvedValue(),
        sequelize: { query: jest.fn().mockResolvedValue([[{ total }]]) }
      });
      delete process.env.CONFIRM_KEYFRAME_IMAGE_DATA_LOSS;
      const guarded = fakeQi(2);
      await expect(migration.down(guarded)).rejects.toThrow(/CONFIRM_KEYFRAME_IMAGE_DATA_LOSS=yes/);
      expect(guarded.removeColumn).not.toHaveBeenCalled();
      process.env.CONFIRM_KEYFRAME_IMAGE_DATA_LOSS = 'yes';
      try {
        const confirmed = fakeQi(2);
        await migration.down(confirmed);
        expect(confirmed.removeColumn.mock.calls.map(c => c[1])).toEqual(['imageUrl', 'imageAlt']);
      } finally { delete process.env.CONFIRM_KEYFRAME_IMAGE_DATA_LOSS; }
      const empty = fakeQi(0);
      await migration.down(empty);
      expect(empty.removeColumn).toHaveBeenCalledTimes(2);
    });
  });
});
