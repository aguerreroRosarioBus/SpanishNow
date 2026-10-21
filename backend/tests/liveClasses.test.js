const request = require('supertest');
const { randomUUID } = require('crypto');
const { app, as, createWorld } = require('./helpers/fixtures');
const { LiveClass, LiveClassMember, Enrollment } = require('../src/models');
const root = '/api/live-classes';
let world;
const patch = (user, id, body) => request(app).patch(`${root}/${id}`).set('Authorization', `Bearer ${user.token}`).send(body);
const create = async (courseId = null) => {
  const res = await as(world.teacher).post(root, { title: 'Clase en vivo', courseId }); expect(res.status).toBe(201); return res.body;
};
const operation = (room, text = 'Hola', id = randomUUID()) => ({ id: randomUUID(), type: 'put', pageId: room.board.activePageId, expectedVersion: 0,
  element: { id, type: 'note', x: 100, y: 100, w: 260, h: 180, color: '#fff2a8', width: 4, text } });
beforeAll(async () => { world = await createWorld(); });
test('authentication and creation are protected; a foreign course cannot be linked', async () => {
  expect((await as(null).get(root)).status).toBe(401);
  expect((await as(world.student).post(root, { title: 'x' })).status).toBe(403);
  expect((await as(world.teacher).post(root, { title: 'x', courseId: world.foreignCourse.id })).status).toBe(403);
  expect((await as(world.teacher).post(root, { title: ' ' })).status).toBe(400);
  expect((await as(world.teacher).get(`${root}/abc`)).status).toBe(404);
});
test('drafts stay private; linked enrolled students see classes only once started', async () => {
  const room = await create(world.course.id);
  expect((await as(world.student).get(`${root}/${room.id}`)).status).toBe(403);
  expect((await as(world.student).get(root)).body.some(c => c.id === room.id)).toBe(false);
  await patch(world.teacher, room.id, { status: 'live' });
  const snapshot = await as(world.student).get(`${root}/${room.id}`);
  expect(snapshot.status).toBe(200); expect(snapshot.body).not.toHaveProperty('joinCode'); expect(snapshot.body).not.toHaveProperty('recentOperations');
  expect((await as(world.student).get(root)).body.some(c => c.id === room.id)).toBe(true);
  expect((await as(world.outsider).post(`${root}/join`, { code: room.joinCode })).status).toBe(403);
  expect((await as(world.otherTeacher).get(`${root}/${room.id}`)).status).toBe(403);
});
test('standalone invites require a live room; membership survives the end of a class', async () => {
  const room = await create();
  expect(room.joinCode).toMatch(/^[\w-]{16}$/);
  expect((await as(world.student).post(`${root}/join`, { code: room.joinCode })).status).toBe(409);
  await patch(world.teacher, room.id, { status: 'live' });
  expect((await as(world.student).get(`${root}/${room.id}`)).status).toBe(403);
  const joined = await as(world.student).post(`${root}/join`, { code: room.joinCode });
  expect(joined.body.id).toBe(room.id);
  expect((await as(world.student).get(root)).body.some(c => c.id === room.id)).toBe(true);
  expect((await as(world.student).post(`${root}/${room.id}/presence`)).status).toBe(204);
  const snapshot = await as(world.teacher).get(`${root}/${room.id}`);
  expect(snapshot.body.participants).toEqual([expect.objectContaining({ id: world.student.id, name: world.student.name, isTeacher: false })]);
  expect(snapshot.body.participants[0]).not.toHaveProperty('email');
  await patch(world.teacher, room.id, { status: 'ended' });
  expect((await as(world.student).get(`${root}/${room.id}`)).status).toBe(200);
  expect((await as(world.student).post(`${root}/join`, { code: room.joinCode })).body.id).toBe(room.id);
  expect((await as(world.student).post(`${root}/${room.id}/operations`, { operations: [operation(room)] })).status).toBe(403);
  expect((await as(world.outsider).post(`${root}/join`, { code: room.joinCode })).status).toBe(409);
});
test('simultaneous student writes merge under database locks; retry after response loss is idempotent', async () => {
  const room = await create(world.course.id); await patch(world.teacher, room.id, { status: 'live' });
  const a = operation(room, 'Uno'), b = operation(room, 'Dos');
  const results = await Promise.all([
    as(world.student).post(`${root}/${room.id}/operations`, { operations: [a] }),
    as(world.student2).post(`${root}/${room.id}/operations`, { operations: [b] })
  ]);
  expect(results.map(r => r.status)).toEqual([200, 200]);
  let saved = await LiveClass.findByPk(room.id);
  expect(saved.board.pages[0].elements.map(e => e.text).sort()).toEqual(['Dos', 'Uno']);
  expect(saved.revision).toBe(3);
  const retry = await as(world.student).post(`${root}/${room.id}/operations`, { operations: [a] });
  expect(retry.status).toBe(200); expect(retry.body.revision).toBe(3);
  const updateA = { ...a, id: randomUUID(), expectedVersion: 1, element: { ...a.element, text: 'Cambio A' } };
  const updateB = { ...updateA, id: randomUUID(), element: { ...a.element, text: 'Cambio B' } };
  const race = await Promise.all([
    as(world.student).post(`${root}/${room.id}/operations`, { operations: [updateA] }),
    as(world.student).post(`${root}/${room.id}/operations`, { operations: [updateB] })
  ]);
  expect(race.map(r => r.status).sort()).toEqual([200, 409]);
  saved = await LiveClass.findByPk(room.id); expect(saved.revision).toBe(4);
  const unchanged = await as(world.student).get(`${root}/${room.id}?since=4`);
  expect(unchanged.body.unchanged).toBe(true); expect(unchanged.body).not.toHaveProperty('board');
});
test('editing lock and ownership are checked on every mutation, including images', async () => {
  const room = await create(world.course.id); await patch(world.teacher, room.id, { status: 'live' });
  const a = operation(room); await as(world.teacher).post(`${root}/${room.id}/operations`, { operations: [a] });
  expect((await as(world.student).post(`${root}/${room.id}/operations`, { operations: [{ ...a, id: randomUUID(), expectedVersion: 1 }] })).status).toBe(403);
  expect((await patch(world.otherTeacher, room.id, { allowStudentEdit: false })).status).toBe(403);
  await patch(world.teacher, room.id, { allowStudentEdit: false });
  expect((await as(world.student).post(`${root}/${room.id}/operations`, { operations: [operation(room)] })).status).toBe(403);
  expect((await as(world.student).post(`${root}/${room.id}/images`)).status).toBe(403);
  expect((await as(world.teacher).post(`${root}/${room.id}/operations`, { operations: [operation(room)] })).status).toBe(200);
  expect((await patch(world.teacher, room.id, { allowStudentEdit: 'true' })).status).toBe(400);
});
test('revoking an enrollment immediately removes access despite prior membership', async () => {
  const room = await create(world.course.id); await patch(world.teacher, room.id, { status: 'live' });
  await as(world.student2).post(`${root}/join`, { code: room.joinCode });
  await Enrollment.destroy({ where: { studentId: world.student2.id, courseId: world.course.id } });
  expect((await as(world.student2).get(`${root}/${room.id}`)).status).toBe(403);
  expect((await as(world.student2).get(root)).body.some(c => c.id === room.id)).toBe(false);
  await Enrollment.create({ studentId: world.student2.id, courseId: world.course.id });
});
test('Google endpoints are teacher-only and return clear unconfigured states without exposing credentials', async () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID; delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  expect((await as(world.teacher).get(`${root}/google/status`)).body).toEqual({ configured: false, connected: false, email: null });
  expect((await as(world.student).get(`${root}/google/status`)).status).toBe(403);
  expect((await as(world.teacher).post(`${root}/google/connect`)).status).toBe(503);
  const room = await create();
  expect((await as(world.outsider).post(`${root}/${room.id}/drive`)).status).toBe(403);
  expect((await as(world.otherTeacher).post(`${root}/${room.id}/drive`)).status).toBe(403);
});
test('no credentials appear in serialized boards, summaries or membership rows', async () => {
  const room = await create();
  const row = await LiveClass.findByPk(room.id);
  expect(row.toJSON()).not.toHaveProperty('credentials');
  expect((await as(world.teacher).get(root)).headers['cache-control']).toBe('no-store');
  expect(await LiveClassMember.count({ where: { liveClassId: room.id } })).toBe(0);
});
