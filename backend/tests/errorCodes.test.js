// Errores con texto libre que ahora viajan con un `code` estable (el cliente traduce por code; `error` se conserva).
const request = require('supertest');
const { randomUUID } = require('crypto');
const { app, as, createWorld, createStory, standardBlocks, planUrl, saveDraft } = require('./helpers/fixtures');
const { errorCode, errorBody, LIVE, IMPORT, STATUS_CODES } = require('../src/services/errorCodes');

const root = '/api/live-classes';
let world;
beforeAll(async () => { world = await createWorld(); });
const patch = (user, id, body) => request(app).patch(`${root}/${id}`).set('Authorization', `Bearer ${user.token}`).send(body);
const create = async courseId => (await as(world.teacher).post(root, { title: 'Clase en vivo', courseId })).body;

describe('errorCodes', () => {
  test('el mensaje conocido gana; si no, manda el estado HTTP; sin ninguno no hay code', () => {
    expect(errorCode(LIVE, 'La clase no está en vivo. Pide al docente que la inicie.', 409)).toBe('live_not_live');
    expect(errorCode(LIVE, 'Mensaje nuevo', 403)).toBe('forbidden');
    expect(errorCode(LIVE, 'Mensaje nuevo', 409)).toBe(STATUS_CODES[409]);
    expect(errorCode(IMPORT, 'The file has more than 500 rows', 400)).toBe('import_too_many_rows');
    expect(errorCode([], 'x', 418)).toBeUndefined();
    expect(errorBody([], 'x', 418)).toEqual({ error: 'x' });
    expect(errorBody(LIVE, 'Clase no encontrada.', 404)).toEqual({ error: 'Clase no encontrada.', code: 'not_found' });  });

  test('el code emitido en el origen gana al texto y a la tabla (#46)', () => {
    expect(errorBody(LIVE, 'La clase no está en vivo. Pide al docente que la inicie.', 409, 'live_editing_paused')).toEqual({ error: 'La clase no está en vivo. Pide al docente que la inicie.', code: 'live_editing_paused' });
    expect(errorBody(IMPORT, 'Texto nuevo sin tabla', 400, 'import_email_column_missing').code).toBe('import_email_column_missing');
    expect(errorBody(IMPORT, 'Texto nuevo sin tabla', 400).code).toBe(STATUS_CODES[400]);
  });
});

describe('clases en vivo', () => {
  test('409 «La clase no está en vivo»: viaja el code y se conserva el texto', async () => {
    const room = await create();
    const res = await as(world.student).post(`${root}/join`, { code: room.joinCode });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: expect.stringContaining('no está en vivo'), code: 'live_not_live' });
  });

  test('403 «El docente pausó la edición» y 403 genérico por estado', async () => {
    const room = await create(world.course.id);
    await patch(world.teacher, room.id, { status: 'live' });
    await patch(world.teacher, room.id, { allowStudentEdit: false });
    const op = { id: randomUUID(), type: 'put', pageId: room.board.activePageId, expectedVersion: 0, element: { id: randomUUID(), type: 'note', x: 10, y: 10, w: 200, h: 100, color: '#fff2a8', width: 4, text: 'Hola' } };
    const paused = await as(world.student).post(`${root}/${room.id}/operations`, { operations: [op] });
    expect(paused.status).toBe(403);
    expect(paused.body.code).toBe('live_editing_paused');
    const foreign = await patch(world.otherTeacher, room.id, { allowStudentEdit: true });
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('forbidden');
  });
});

describe('compositor', () => {
  test('409 de revisión del borrador: lesson_plan_revision_conflict', async () => {
    const content = await createStory(world);
    const { blocks } = standardBlocks({ vocab: world.vocab, ...content });
    const saved = await saveDraft(world.teacher, content.story.id, blocks);
    expect(saved.status).toBe(200);
    const res = await as(world.teacher).post(`${planUrl(content.story.id)}/publish`, { revision: saved.body.revision + 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('lesson_plan_revision_conflict');
    expect(res.body.error).toBeTruthy();
  });
});
