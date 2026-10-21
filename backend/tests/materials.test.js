// PDF materials, video links and the extended course responses. Uploads go to the local stand-in, never to Cloudinary.
process.env.MEDIA_FAKE_UPLOADS = '1';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app, as, createWorld, createStory, findKeys } = require('./helpers/fixtures');
const { publish } = require('./helpers/sales');
const fakeUploads = require('../src/config/fakeUploads');
const materialService = require('../src/services/materialService');
const { Material, Unit, Story } = require('../src/models');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const YT = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

const upload = (user, courseId, { file = PDF, name = 'guia.pdf', fields = { title: 'Guía' } } = {}) => {
  let req = request(app).post(`/api/courses/${courseId}/materials`);
  if (user) req = req.set('Authorization', `Bearer ${user.token}`);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
  return file === null ? req : req.attach('file', file, { filename: name, contentType: 'application/pdf' });
};

const stored = [];
afterAll(async () => { for (const url of stored) await fakeUploads.removeFake(url); });
const track = async id => { const m = await Material.findByPk(id); if (m) stored.push(m.fileUrl); return m; };

describe('video links', () => {
  let world; let story;
  beforeAll(async () => { world = await createWorld(); story = (await createStory(world)).story; });

  test('PUT /courses/:id normalises introVideoUrl, rejects other hosts and clears with null', async () => {
    const put = body => as(world.teacher).put(`/api/courses/${world.course.id}`, { title: world.course.title, description: 'd', level: 'A1', ...body });
    const ok = await put({ introVideoUrl: 'https://youtu.be/dQw4w9WgXcQ?si=1' });
    expect([ok.status, ok.body.introVideoUrl]).toEqual([200, YT]);
    const bad = await put({ introVideoUrl: 'https://example.com/movie.mp4' });
    expect([bad.status, bad.body.error]).toEqual([400, expect.stringMatching(/YouTube, Vimeo or Bunny/)]);
    expect((await world.course.reload()).introVideoUrl).toBe(YT); // a rejected value changes nothing
    expect((await put({ title: 'Otro título' })).body.introVideoUrl).toBe(YT); // not sent: untouched
    const cleared = await put({ introVideoUrl: null });
    expect([cleared.status, cleared.body.introVideoUrl]).toEqual([200, null]);
  });

  test('PUT /stories/:id (multipart) stores the embed URL; an empty string removes the video; invalid is 400', async () => {
    const put = value => request(app).put(`/api/stories/${story.id}`).set('Authorization', `Bearer ${world.teacher.token}`).field('videoUrl', value);
    const vimeo = await put('https://vimeo.com/76979871/abcdef1234');
    expect([vimeo.status, vimeo.body.videoUrl]).toEqual([200, 'https://player.vimeo.com/video/76979871?h=abcdef1234']);
    const bad = await put('https://evil.example/watch?v=dQw4w9WgXcQ');
    expect(bad.status).toBe(400);
    expect((await story.reload()).videoUrl).toBe('https://player.vimeo.com/video/76979871?h=abcdef1234');
    const cleared = await put('');
    expect([cleared.status, cleared.body.videoUrl]).toEqual([200, null]);
    expect((await as(world.otherTeacher).put(`/api/stories/${story.id}`, { videoUrl: YT })).status).toBe(403);
  });
});

describe('materials', () => {
  let world; let story; let material;
  beforeAll(async () => { world = await createWorld(); story = (await createStory(world)).story; });

  test('only the course teacher uploads and lists; the response never carries the file location', async () => {
    const res = await upload(world.teacher, world.course.id);
    expect(res.status).toBe(201);
    material = await track(res.body.id);
    expect(res.body).toEqual({ id: material.id, courseId: world.course.id, unitId: null, storyId: null, title: 'Guía', sizeBytes: PDF.length, order: 0 });
    expect(material.fileUrl).toMatch(/\/uploads-dev\/[0-9a-f-]{36}\.pdf$/);

    expect((await upload(null, world.course.id)).status).toBe(401);
    expect((await upload(world.student, world.course.id)).status).toBe(403);
    expect((await upload(world.otherTeacher, world.course.id)).status).toBe(403);
    expect((await upload(world.teacher, 99999999)).status).toBe(404);

    const list = await as(world.teacher).get(`/api/courses/${world.course.id}/materials`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([res.body]);
    expect(findKeys(list.body, /fileUrl|providerPublicId/)).toEqual([]);
    expect((await as(world.student).get(`/api/courses/${world.course.id}/materials`)).status).toBe(403);
    expect((await as(world.otherTeacher).get(`/api/courses/${world.course.id}/materials`)).status).toBe(403);
    expect((await as(null).get(`/api/courses/${world.course.id}/materials`)).status).toBe(401);
  });

  test('attaches to a unit or a story of the same course (not both), orders after the previous one and defaults the title to the file name', async () => {
    const onUnit = await upload(world.teacher, world.course.id, { fields: { title: 'De la unidad', unitId: world.unit.id } });
    const onStory = await upload(world.teacher, world.course.id, { fields: { title: 'De la historia', storyId: story.id } });
    const second = await upload(world.teacher, world.course.id, { name: 'Segundo.pdf', fields: {} });
    for (const r of [onUnit, onStory, second]) { expect(r.status).toBe(201); await track(r.body.id); }
    expect(onUnit.body).toMatchObject({ unitId: world.unit.id, storyId: null, order: 0 });
    expect(onStory.body).toMatchObject({ unitId: null, storyId: story.id, order: 0 });
    expect(second.body).toMatchObject({ title: 'Segundo', unitId: null, storyId: null, order: 1 });

    const both = await upload(world.teacher, world.course.id, { fields: { title: 'x', unitId: world.unit.id, storyId: story.id } });
    expect(both.status).toBe(400);
    const foreignUnit = await Unit.create({ courseId: world.foreignCourse.id, title: 'Ajena', description: 'x', order: 5 });
    expect((await upload(world.teacher, world.course.id, { fields: { title: 'x', unitId: foreignUnit.id } })).status).toBe(400);
    expect((await upload(world.teacher, world.course.id, { fields: { title: 'x', storyId: world.foreignStory.id } })).status).toBe(400);
    expect((await upload(world.teacher, world.course.id, { fields: { title: 'x', unitId: 'abc' } })).status).toBe(400);
    expect((await upload(world.teacher, world.course.id, { fields: { title: 'x'.repeat(201) } })).status).toBe(400);
  });

  test('accepts only a real PDF of at most 20 MB (checked by signature, not by name or type)', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]);
    const disguised = await upload(world.teacher, world.course.id, { file: png, name: 'foto.pdf' });
    expect([disguised.status, disguised.body.error]).toEqual([400, 'The file is not a PDF']);
    expect((await upload(world.teacher, world.course.id, { file: Buffer.from('hola'), name: 'a.pdf' })).status).toBe(400);
    expect((await upload(world.teacher, world.course.id, { file: null })).status).toBe(400);
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20 * 1024 * 1024)]);
    expect((await upload(world.teacher, world.course.id, { file: big })).status).toBe(413);
    expect(await Material.count({ where: { title: 'foto' } })).toBe(0);
    expect(materialService.isPdf(PDF)).toBe(true);
    expect(materialService.isPdf(png)).toBe(false);
  });

  test('download-url: 401 anonymous, 403 outsiders, 200 for enrolled students and the course teacher, 404 unknown', async () => {
    const url = `/api/materials/${material.id}/download-url`;
    expect((await as(null).get(url)).status).toBe(401);
    expect((await as(world.outsider).get(url)).status).toBe(403);
    expect((await as(world.otherTeacher).get(url)).status).toBe(403);
    expect((await as(world.student).get('/api/materials/99999999/download-url')).status).toBe(404);
    expect((await as(world.student).get('/api/materials/abc/download-url')).status).toBe(404);

    for (const user of [world.student, world.student2, world.teacher]) {
      const res = await as(user).get(url);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ url: material.fileUrl, filename: 'Guia.pdf' });
    }
    const file = await request(app).get(new URL(material.fileUrl).pathname); // local stand-in serves the file
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/pdf/);
  });

  test('with Cloudinary the link is an API download URL signed with a short expiry and the title becomes a safe file name', () => {
    const cloudinary = require('../src/config/cloudinary');
    cloudinary.config({ cloud_name: 'demo', api_key: '123', api_secret: 'secret' });
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    const { url, filename } = materialService.downloadUrl({ id: 1, title: 'Guía: módulo 1/2 ¿ok?', fileUrl: 'https://res.cloudinary.com/demo/raw/authenticated/x.pdf', providerPublicId: 'spanishnow/materials/abc.pdf' }, { now });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.cloudinary.com/v1_1/demo/raw/download');
    expect(parsed.searchParams.get('public_id')).toBe('spanishnow/materials/abc.pdf');
    expect(parsed.searchParams.get('type')).toBe('authenticated');
    expect(Number(parsed.searchParams.get('expires_at'))).toBe(Math.floor(now / 1000) + 300);
    expect(parsed.searchParams.get('signature')).toMatch(/^[0-9a-f]{40,64}$/);
    expect(url).not.toContain('secret');
    expect(filename).toBe('Guia modulo 12 ok.pdf');
  });

  test('rename and reorder: owner only, validated', async () => {
    const url = `/api/materials/${material.id}`;
    expect((await as(world.otherTeacher).put(url, { title: 'x' })).status).toBe(403);
    expect((await as(world.student).put(url, { title: 'x' })).status).toBe(403);
    expect((await as(null).put(url, { title: 'x' })).status).toBe(401);
    expect((await as(world.teacher).put(url, { title: '  ' })).status).toBe(400);
    expect((await as(world.teacher).put(url, { order: -1 })).status).toBe(400);
    expect((await as(world.teacher).put(url, { order: '3' })).status).toBe(400);
    const res = await as(world.teacher).put(url, { title: 'Guía renombrada', order: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: material.id, title: 'Guía renombrada', order: 5 });
    expect(findKeys(res.body, /fileUrl|providerPublicId/)).toEqual([]);
    expect((await as(world.teacher).put('/api/materials/99999999', { title: 'x' })).status).toBe(404);
  });

  test('delete: owner only, 204, removes the row and the file', async () => {
    const res = await upload(world.teacher, world.course.id, { fields: { title: 'Para borrar' } });
    const doomed = await track(res.body.id);
    const file = path.join(fakeUploads.DIR, path.basename(doomed.fileUrl));
    expect(fs.existsSync(file)).toBe(true);
    expect((await as(world.otherTeacher).delete(`/api/materials/${doomed.id}`)).status).toBe(403);
    expect((await as(world.student).delete(`/api/materials/${doomed.id}`)).status).toBe(403);
    expect((await as(world.teacher).delete(`/api/materials/${doomed.id}`)).status).toBe(204);
    expect(await Material.findByPk(doomed.id)).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
    expect((await as(world.teacher).delete(`/api/materials/${doomed.id}`)).status).toBe(404);
  });

  test('deleting a story removes its materials and their files', async () => {
    const extra = (await createStory(world)).story;
    const res = await upload(world.teacher, world.course.id, { fields: { title: 'De la historia a borrar', storyId: extra.id } });
    const m = await track(res.body.id);
    const file = path.join(fakeUploads.DIR, path.basename(m.fileUrl));
    expect((await as(world.teacher).delete(`/api/stories/${extra.id}`)).status).toBe(200);
    expect(await Material.findByPk(m.id)).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
    expect(await Story.findByPk(extra.id)).toBeNull();
  });
});

describe('course responses used by the player and the sales page', () => {
  let world; let story; let course; let published;
  beforeAll(async () => {
    world = await createWorld();
    story = (await createStory(world)).story;
    course = await publish(world.course);
    await course.update({ introVideoUrl: YT });
    await story.update({ videoUrl: 'https://player.vimeo.com/video/76979871' });
    const add = async fields => { const r = await upload(world.teacher, course.id, { fields }); await track(r.body.id); return r.body; };
    await add({ title: 'Del curso' });
    await add({ title: 'De la unidad', unitId: world.unit.id });
    await add({ title: 'De la historia', storyId: story.id });
    const quizUrl = `/api/units/${world.unit.id}/quiz`;
    published = (await as(world.teacher).put(quizUrl, { title: 'Quiz', passingScore: 80, isPublished: true, questions: [{ prompt: 'P', options: ['a', 'b'], correctIndex: 0 }, { prompt: 'Q', options: ['a', 'b'], correctIndex: 1 }] })).body;
  });

  test('GET /courses/:id for a student: video, PDFs by place without links, and the quiz summary only when published', async () => {
    const res = await as(world.student).get(`/api/courses/${course.id}`);
    expect(res.status).toBe(200);
    expect(res.body.introVideoUrl).toBe(YT);
    expect(res.body.materials).toEqual([{ id: expect.any(Number), courseId: course.id, unitId: null, storyId: null, title: 'Del curso', sizeBytes: PDF.length, order: 0 }]);
    const unit = res.body.units[0];
    expect(unit.materials.map(m => m.title)).toEqual(['De la unidad']);
    expect(unit.quiz).toEqual({ id: published.id, title: 'Quiz', questionCount: 2, passingScore: 80, isPublished: true });
    const s = unit.stories.find(x => x.id === story.id);
    expect(s.videoUrl).toBe('https://player.vimeo.com/video/76979871');
    expect(s.materials.map(m => m.title)).toEqual(['De la historia']);
    expect(findKeys(res.body, /fileUrl|providerPublicId|correctIndex|explanation/)).toEqual([]);

    await as(world.teacher).put(`/api/units/${world.unit.id}/quiz`, { ...published, isPublished: false });
    expect((await as(world.student).get(`/api/courses/${course.id}`)).body.units[0].quiz).toBeNull();
    const asTeacher = await as(world.teacher).get(`/api/courses/${course.id}`);
    expect(asTeacher.body.units[0].quiz).toMatchObject({ id: published.id, isPublished: false }); // the teacher sees the draft
    expect(findKeys(asTeacher.body, /fileUrl|providerPublicId/)).toEqual([]);
    await as(world.teacher).put(`/api/units/${world.unit.id}/quiz`, { ...published, isPublished: true });
  });

  test('the progress of a student also lists the quizzes (published only) with the best score', async () => {
    const unitQuiz = `/api/units/${world.unit.id}/quiz`;
    await as(world.student).post(`${unitQuiz}/attempts`, { answers: [0, 0] }); // 50
    const res = await as(world.student).get(`/api/enrollments/${world.enrollments.student.id}/progress`);
    expect(res.body.quizzes).toEqual([{ unitId: world.unit.id, quizId: published.id, bestScore: 50, passed: false }]);
    const none = await as(world.student2).get(`/api/enrollments/${world.enrollments.student2.id}/progress`);
    expect(none.body.quizzes).toEqual([{ unitId: world.unit.id, quizId: published.id, bestScore: null, passed: false }]);
  });

  test('GET /public/courses/:slug: intro video, hasVideo, hasQuiz and materialsCount, never the links or the story video', async () => {
    const res = await as(null).get(`/api/public/courses/${course.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.introVideoUrl).toBe(YT);
    expect(res.body.materialsCount).toBe(3);
    expect(res.body.units[0].hasQuiz).toBe(true);
    expect(res.body.units[0].stories.find(s => s.id === story.id).hasVideo).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/fileUrl|uploads-dev|player\.vimeo\.com|correctIndex/);
    const list = await as(null).get('/api/public/courses');
    expect(findKeys(list.body, /introVideoUrl|materials/)).toEqual([]);
  });
});
