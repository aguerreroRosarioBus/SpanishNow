// Keyframe audio: upload/removal on the draft. Cloudinary is always mocked; nothing is uploaded.
jest.mock('../src/config/cloudinary', () => ({ uploadFromBuffer: jest.fn() }));

const request = require('supertest');
const cloudinary = require('../src/config/cloudinary');
const { LessonBlock } = require('../src/models');
const { app, as, createWorld, createStory, standardBlocks, planUrl, saveDraft, publishPlan, openLesson } = require('./helpers/fixtures');

describe('TPRS lesson plans: keyframe audio', () => {
  let world;
  beforeAll(async () => { world = await createWorld(); });
  beforeEach(() => {
    cloudinary.uploadFromBuffer.mockReset();
    cloudinary.uploadFromBuffer.mockResolvedValue({ secure_url: 'https://res.cloudinary.test/spanishnow/keyframes/k1.mp3' });
  });

  async function storyWithDraft() {
    const content = await createStory(world);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    const saved = await saveDraft(world.teacher, content.story.id, blocks);
    expect(saved.status).toBe(200);
    return { ...content, keys, draft: saved.body };
  }

  const audioUrl = (storyId, blockKey) => `${planUrl(storyId)}/draft/blocks/${blockKey}/audio`;
  const getDraft = storyId => as(world.teacher).get(`${planUrl(storyId)}/draft`);
  const blockOf = async (storyId, key) => (await getDraft(storyId)).body.blocks.find(b => b.blockKey === key);
  const upload = (user, storyId, blockKey, { field = 'audio', name = 'clip.mp3', type = 'audio/mpeg', content = Buffer.from('fake-audio') } = {}) => {
    const req = request(app).post(audioUrl(storyId, blockKey));
    if (user) req.set('Authorization', `Bearer ${user.token}`);
    return req.attach(field, content, { filename: name, contentType: type });
  };

  test('the owner uploads audio to a keyframe: stored in the draft and returned', async () => {
    const { story, keys } = await storyWithDraft();

    const res = await upload(world.teacher, story.id, keys.k1);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ blockKey: keys.k1, audioUrl: 'https://res.cloudinary.test/spanishnow/keyframes/k1.mp3' });
    expect(cloudinary.uploadFromBuffer).toHaveBeenCalledTimes(1);
    const [buffer, options] = cloudinary.uploadFromBuffer.mock.calls[0];
    expect(buffer.toString()).toBe('fake-audio');
    expect(options).toMatchObject({ folder: 'spanishnow/keyframes', resource_type: 'video' });
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBe(res.body.audioUrl);
    expect((await blockOf(story.id, keys.k2)).audioUrl).toBeNull();
  });

  test('publishing keeps the keyframe audioUrl and the student receives it', async () => {
    const { story, keys, draft } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);

    const published = await as(world.teacher).post(`${planUrl(story.id)}/publish`, { revision: draft.revision });

    expect(published.status).toBe(201);
    expect(published.body.blocks.find(b => b.blockKey === keys.k1).audioUrl).toBe('https://res.cloudinary.test/spanishnow/keyframes/k1.mp3');
    const lesson = (await openLesson(world.student, story.id)).body;
    expect(lesson.blocks.find(b => b.blockKey === keys.k1).audioUrl).toBe('https://res.cloudinary.test/spanishnow/keyframes/k1.mp3');
    // The next draft starts from the published blocks, audio included.
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBe('https://res.cloudinary.test/spanishnow/keyframes/k1.mp3');
  });

  test('a teacher who does not own the course gets 403 and nothing is uploaded', async () => {
    const { story, keys } = await storyWithDraft();
    const res = await upload(world.otherTeacher, story.id, keys.k1);
    expect(res.status).toBe(403);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBeNull();
  });

  test('students and anonymous users are rejected', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.student, story.id, keys.k1)).status).toBe(403);
    expect((await upload(null, story.id, keys.k1)).status).toBe(401);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
  });

  test('a block that is not a keyframe gets 400', async () => {
    const { story, keys } = await storyWithDraft();
    for (const key of [keys.q1, keys.full, keys.exp]) {
      expect((await upload(world.teacher, story.id, key)).status).toBe(400);
    }
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
  });

  test('a block that does not exist in the draft gets 404 (also for DELETE)', async () => {
    const { story } = await storyWithDraft();
    const missing = '11111111-1111-4111-8111-111111111111';
    expect((await upload(world.teacher, story.id, missing)).status).toBe(404);
    expect((await as(world.teacher).delete(audioUrl(story.id, missing))).status).toBe(404);
    expect((await upload(world.teacher, 99999999, missing)).status).toBe(404);
  });

  test('a file that is not audio, or a missing file, gets 400', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1, { name: 'photo.png', type: 'image/png' })).status).toBe(400);
    expect((await upload(world.teacher, story.id, keys.k1, { name: 'doc.pdf', type: 'application/pdf' })).status).toBe(400);
    expect((await upload(world.teacher, story.id, keys.k1, { name: 'x.exe', type: 'application/x-msdownload' })).status).toBe(400);
    const none = await as(world.teacher).post(audioUrl(story.id, keys.k1), {});
    expect(none.status).toBe(400);
    const wrongField = await upload(world.teacher, story.id, keys.k1, { field: 'file' });
    expect(wrongField.status).toBe(400);
    expect(cloudinary.uploadFromBuffer).not.toHaveBeenCalled();
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBeNull();
  });

  test('a Cloudinary failure returns 502 and leaves the block untouched', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);
    cloudinary.uploadFromBuffer.mockRejectedValueOnce(new Error('cloudinary down'));

    const res = await upload(world.teacher, story.id, keys.k1, { name: 'new.mp3' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/upload failed/i);
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBe('https://res.cloudinary.test/spanishnow/keyframes/k1.mp3');
  });

  test('a Cloudinary answer without a usable URL is also a 502', async () => {
    const { story, keys } = await storyWithDraft();
    cloudinary.uploadFromBuffer.mockResolvedValueOnce({});
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(502);
    cloudinary.uploadFromBuffer.mockResolvedValueOnce({ secure_url: `https://x.test/${'a'.repeat(500)}` });
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(502);
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBeNull();
  });

  test('DELETE clears audioUrl and answers { blockKey, audioUrl: null }', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await upload(world.teacher, story.id, keys.k1)).status).toBe(200);

    const res = await as(world.teacher).delete(audioUrl(story.id, keys.k1));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ blockKey: keys.k1, audioUrl: null });
    expect((await blockOf(story.id, keys.k1)).audioUrl).toBeNull();
    // Idempotent
    expect((await as(world.teacher).delete(audioUrl(story.id, keys.k1))).status).toBe(200);
  });

  test('DELETE: non-owner 403, non-keyframe 400', async () => {
    const { story, keys } = await storyWithDraft();
    expect((await as(world.otherTeacher).delete(audioUrl(story.id, keys.k1))).status).toBe(403);
    expect((await as(world.student).delete(audioUrl(story.id, keys.k1))).status).toBe(403);
    expect((await as(world.teacher).delete(audioUrl(story.id, keys.q1))).status).toBe(400);
  });

  test('uploading after publishing modifies only the new draft, never the published revision', async () => {
    const content = await createStory(world);
    const { blocks, keys } = standardBlocks({ vocab: world.vocab, ...content });
    await publishPlan(world.teacher, content.story.id, blocks);

    const res = await upload(world.teacher, content.story.id, keys.k1);

    expect(res.status).toBe(200);
    const published = await openLesson(world.student, content.story.id);
    expect(published.body.blocks.find(b => b.blockKey === keys.k1).audioUrl).toBeNull();
    const draftBlock = await LessonBlock.findOne({ where: { blockKey: keys.k1, audioUrl: res.body.audioUrl } });
    expect(draftBlock).not.toBeNull();
  });
});
