// W04 private chat (SPEC §6, CONTRATO.md §3.3 and §9.2): participants-only access (CHAT-02, AC01), idempotent sends
// (CHAT-03), seq cursors and monotonic read cursors (CHAT-03/10), anti-spam windows (CHAT-07), block/report and
// moderation (CHAT-08/10) and the grouped unread email (CHAT-09).
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const {
  TeacherClassSettings, Conversation, Message, ConversationParticipant, RateLimitBucket, OutboxJob, AuditLog, Course
} = require('../src/models');
const chat = require('../src/services/chatService');
const rateLimit = require('../src/services/rateLimit');
const { getOutbox, clearOutbox } = require('../src/services/mailService');
const { as, createUser } = require('./helpers/fixtures');

const HOUR = 3600e3;
let seq = 0;
const cid = () => `c-${Date.now()}-${(seq += 1)}`;

beforeAll(() => {
  process.env.FEATURE_CHAT = '1';
  // Every request in the suite comes from 127.0.0.1: keep the per-IP window out of the way except where it is tested.
  process.env.CHAT_IP_ACTIONS_PER_HOUR = '1000000';
});
afterAll(() => {
  delete process.env.FEATURE_CHAT;
  delete process.env.CHAT_IP_ACTIONS_PER_HOUR;
});

async function availableTeacher(label = 'chat-teacher') {
  const teacher = await createUser('teacher', label);
  await TeacherClassSettings.create({ userId: teacher.id, classesEnabledAt: new Date(), acceptsInquiries: true });
  return teacher;
}

async function open(student, teacher, body = {}) {
  const res = await as(student).post('/api/conversations', { teacherId: teacher.id, ...body });
  expect([200, 201]).toContain(res.status);
  return res.body;
}

const send = (user, conversationId, body, clientMessageId = cid(), extra = {}) =>
  as(user).post(`/api/conversations/${conversationId}/messages`, { clientMessageId, body, ...extra });

/** Pre-fills the current window of a bucket so the next hit is the one over the limit. */
async function fillBucket(bucketKey, hits, windowMs = HOUR) {
  const windowStart = rateLimit.windowStartOf(new Date(), windowMs);
  await RateLimitBucket.destroy({ where: { bucketKey } });
  await RateLimitBucket.create({ bucketKey, windowStart, hits });
}

describe('CHAT-01/02, AC01: an inquiry without a purchase, visible only to its two participants', () => {
  let teacher, student, otherStudent, otherTeacher, moderator, conversation;
  beforeAll(async () => {
    teacher = await availableTeacher();
    otherTeacher = await availableTeacher('chat-other-teacher');
    [student, otherStudent] = await Promise.all([createUser('student', 'chat-student'), createUser('student', 'chat-other-student')]);
    moderator = await createUser('teacher', 'chat-moderator');
    await moderator.update({ permissions: ['chat.moderate', 'users.manage', 'class_sessions.support'] });
    conversation = await open(student, teacher);
  });

  test('available teachers are listed; a student opens one conversation per pair', async () => {
    const list = await as(student).get('/api/teachers/available');
    expect(list.status).toBe(200);
    expect(list.body.map(t => t.id)).toEqual(expect.arrayContaining([teacher.id, otherTeacher.id]));
    expect(list.body.find(t => t.id === teacher.id)).toEqual({ id: teacher.id, name: teacher.name });

    expect(conversation).toMatchObject({ role: 'student', counterpart: { id: teacher.id, role: 'teacher' }, unreadCount: 0, lastMessageSeq: 0 });
    const again = await as(student).post('/api/conversations', { teacherId: teacher.id });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(conversation.id);
    expect(await Conversation.count({ where: { teacherId: teacher.id, studentId: student.id } })).toBe(1);
  });

  test('two tabs opening the same pair at once get the same conversation', async () => {
    const fresh = await createUser('student', 'chat-two-tabs');
    const [a, b] = await Promise.all([as(fresh).post('/api/conversations', { teacherId: teacher.id }), as(fresh).post('/api/conversations', { teacherId: teacher.id })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await ConversationParticipant.count({ where: { conversationId: a.body.id } })).toBe(2);
  });

  test('teachers not enabled or not taking inquiries, non-teachers and teachers starting chats are refused', async () => {
    const closed = await createUser('teacher', 'chat-closed');
    await TeacherClassSettings.create({ userId: closed.id, classesEnabledAt: new Date(), acceptsInquiries: false });
    const res = await as(student).post('/api/conversations', { teacherId: closed.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('teacher_unavailable');
    expect((await as(student).get('/api/teachers/available')).body.map(t => t.id)).not.toContain(closed.id);

    expect((await as(student).post('/api/conversations', { teacherId: otherStudent.id })).body.code).toBe('not_found');
    const byTeacher = await as(teacher).post('/api/conversations', { teacherId: otherTeacher.id });
    expect(byTeacher.status).toBe(403);
    expect(byTeacher.body.code).toBe('forbidden');
    expect((await as(student).post('/api/conversations', { teacherId: 'x' })).body.code).toBe('validation_failed');
  });

  test('the teacher answers and both read the same history', async () => {
    expect((await send(student, conversation.id, 'Hola, ¿das clases para principiantes?')).status).toBe(201);
    const reply = await send(teacher, conversation.id, '¡Hola! Sí, con gusto.');
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({ seq: 2, type: 'text', senderRole: 'teacher', mine: true });

    const forStudent = await as(student).get(`/api/conversations/${conversation.id}/messages`);
    expect(forStudent.body.items.map(m => [m.seq, m.senderRole, m.mine])).toEqual([[1, 'student', true], [2, 'teacher', false]]);
    expect(forStudent.body.items[1].clientMessageId).toBeNull(); // another sender's idempotency key is not exposed
    const detail = await as(student).get(`/api/conversations/${conversation.id}`);
    expect(detail.body).toMatchObject({ teacherReplied: true, unreadCount: 1 });
  });

  test('another student, another teacher and an admin without a report get 404 everywhere', async () => {
    for (const intruder of [otherStudent, otherTeacher, moderator]) {
      expect((await as(intruder).get(`/api/conversations/${conversation.id}`)).status).toBe(404);
      expect((await as(intruder).get(`/api/conversations/${conversation.id}/messages`)).status).toBe(404);
      expect((await send(intruder, conversation.id, 'hola')).status).toBe(404);
      expect((await as(intruder).post(`/api/conversations/${conversation.id}/read`, { seq: 1 })).status).toBe(404);
      expect((await as(intruder).post(`/api/conversations/${conversation.id}/block`)).status).toBe(404);
      expect((await as(intruder).post(`/api/conversations/${conversation.id}/report`, { reason: 'x' })).status).toBe(404);
      const inbox = await as(intruder).get('/api/conversations');
      expect(inbox.body.items.map(c => c.id)).not.toContain(conversation.id);
    }
    // chat.moderate does not open conversations nobody reported.
    expect((await as(moderator).get(`/api/admin/chat/reports/${conversation.id}/messages`)).status).toBe(404);
    expect((await as(student).get('/api/conversations/999999999')).body.code).toBe('not_found');
  });

  test('a "sign in as" session cannot read private messages', async () => {
    const token = jwt.sign({ id: student.id, role: 'student', impersonatedBy: moderator.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await as({ token }).get(`/api/conversations/${conversation.id}/messages`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', params: { reason: 'impersonation' } });
  });

  test('without FEATURE_CHAT new conversations and messages are 404, the history stays readable', async () => {
    delete process.env.FEATURE_CHAT;
    try {
      const fresh = await createUser('student', 'chat-flag');
      expect((await as(fresh).post('/api/conversations', { teacherId: teacher.id })).body.code).toBe('feature_disabled');
      expect((await send(student, conversation.id, 'hola')).body.code).toBe('feature_disabled');
      expect((await as(student).get('/api/teachers/available')).status).toBe(404);
      expect((await as(student).get(`/api/conversations/${conversation.id}/messages`)).status).toBe(200);
      expect((await as(student).post(`/api/conversations/${conversation.id}/read`, { seq: 1 })).status).toBe(200);
    } finally {
      process.env.FEATURE_CHAT = '1';
    }
  });
});

describe('CHAT-03/05: idempotent sends and server order', () => {
  let teacher, student, conversation;
  beforeAll(async () => {
    teacher = await availableTeacher();
    student = await createUser('student', 'chat-idem');
    conversation = await open(student, teacher);
    await send(teacher, conversation.id, 'Bienvenido'); // so the student is past the before-reply window
  });

  test('the same clientMessageId returns the stored message with 200, never a second one', async () => {
    const key = cid();
    const first = await send(student, conversation.id, 'Mensaje con reintento', key);
    const retry = await send(student, conversation.id, 'Mensaje con reintento', key);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ id: first.body.id, seq: first.body.seq, clientMessageId: key });
    expect(await Message.count({ where: { conversationId: conversation.id, clientMessageId: key } })).toBe(1);

    const conflict = await send(student, conversation.id, 'Otro texto', key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('operation_key_conflict');
    // The key is per sender: the teacher can use the same one.
    expect((await send(teacher, conversation.id, 'Respuesta', key)).status).toBe(201);
  });

  test('concurrent retries store one message; concurrent different messages get consecutive seqs', async () => {
    const key = cid();
    const same = await Promise.all([1, 2, 3].map(() => send(student, conversation.id, 'Doble clic', key)));
    expect(same.map(r => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(same.map(r => r.body.id)).size).toBe(1);

    const before = (await Conversation.findByPk(conversation.id)).lastMessageSeq;
    const many = await Promise.all([1, 2, 3, 4].map(n => send(student, conversation.id, `Mensaje ${n}`)));
    expect(many.every(r => r.status === 201)).toBe(true);
    expect(many.map(r => r.body.seq).sort((a, b) => a - b)).toEqual([before + 1, before + 2, before + 3, before + 4]);
  });

  test('text is plain, at most 2000 characters, never empty; invalid keys are refused', async () => {
    const html = '<img src=x onerror=alert(1)> **hola**';
    const stored = await send(student, conversation.id, html);
    expect(stored.body.body).toBe(html); // stored verbatim; the client renders it as text
    expect((await send(student, conversation.id, 'ñ'.repeat(2000))).status).toBe(201);
    const long = await send(student, conversation.id, 'a'.repeat(2001));
    expect(long.status).toBe(400);
    expect(long.body).toMatchObject({ code: 'message_too_long', params: { max: 2000 } });
    expect((await send(student, conversation.id, '   \n ')).body.code).toBe('validation_failed');
    expect((await send(student, conversation.id, 'hola', 'no válido!')).body.code).toBe('validation_failed');
    expect((await send(student, conversation.id, 'hola', 'x'.repeat(65))).body.code).toBe('validation_failed');
  });

  test('a context must belong to the pair', async () => {
    const course = await Course.create({ title: 'Curso del docente', description: 'x', level: 'A1', teacherId: teacher.id });
    const foreign = await Course.create({ title: 'Curso ajeno', description: 'x', level: 'A1', teacherId: (await createUser('teacher', 'chat-foreign')).id });
    const ok = await send(student, conversation.id, 'Pregunta sobre el curso', cid(), { context: { type: 'course', id: course.id } });
    expect(ok.body.context).toEqual({ type: 'course', id: course.id, title: null });
    const bad = await send(student, conversation.id, 'x', cid(), { context: { type: 'course', id: foreign.id } });
    expect(bad.body).toMatchObject({ code: 'validation_failed', params: { fields: ['context'] } });
    const inbox = await as(student).get('/api/conversations');
    expect(inbox.body.items.find(c => c.id === conversation.id).context).toEqual({ type: 'course', id: course.id, title: { es: 'Curso del docente', en: 'Curso del docente' } });
  });
});

describe('CHAT-03/10: cursors, unread counts and monotonic read cursor', () => {
  let teacher, student, conversation;
  beforeAll(async () => {
    teacher = await availableTeacher();
    student = await createUser('student', 'chat-cursor');
    conversation = await open(student, teacher);
    await send(student, conversation.id, 'Mensaje 1');
    for (let n = 2; n <= 7; n += 1) await send(teacher, conversation.id, `Mensaje ${n}`);
  });

  test('history pages backwards by seq and polls forward with afterSeq', async () => {
    const latest = await as(student).get(`/api/conversations/${conversation.id}/messages?limit=3`);
    expect(latest.body.items.map(m => m.seq)).toEqual([5, 6, 7]);
    expect(latest.body.hasMore).toBe(true);
    const older = await as(student).get(`/api/conversations/${conversation.id}/messages?limit=3&beforeSeq=5`);
    expect(older.body.items.map(m => m.seq)).toEqual([2, 3, 4]);
    const oldest = await as(student).get(`/api/conversations/${conversation.id}/messages?limit=3&beforeSeq=2`);
    expect(oldest.body).toMatchObject({ hasMore: false });
    expect(oldest.body.items.map(m => m.seq)).toEqual([1]);
    const poll = await as(student).get(`/api/conversations/${conversation.id}/messages?afterSeq=5&limit=10`);
    expect(poll.body.items.map(m => m.seq)).toEqual([6, 7]);
    expect(poll.body.hasMore).toBe(false);
    const nothing = await as(student).get(`/api/conversations/${conversation.id}/messages?afterSeq=7`);
    expect(nothing.body.items).toEqual([]);
    expect((await as(student).get(`/api/conversations/${conversation.id}/messages?afterSeq=1&beforeSeq=3`)).status).toBe(400);
    expect((await as(student).get(`/api/conversations/${conversation.id}/messages?limit=-1`)).status).toBe(400);
  });

  test('unread counts others\' messages; the cursor never goes back nor past the last message', async () => {
    const summary = await as(student).get('/api/conversations/unread');
    expect(summary.body.messages).toBeGreaterThanOrEqual(6);
    expect((await as(student).get(`/api/conversations/${conversation.id}`)).body.unreadCount).toBe(6);
    expect((await as(teacher).get(`/api/conversations/${conversation.id}`)).body.unreadCount).toBe(1);

    expect((await as(student).post(`/api/conversations/${conversation.id}/read`, { seq: 5 })).body).toEqual({ lastReadSeq: 5 });
    // A second tab with an older view does not bring old messages back as unread.
    expect((await as(student).post(`/api/conversations/${conversation.id}/read`, { seq: 2 })).body).toEqual({ lastReadSeq: 5 });
    expect((await as(student).get(`/api/conversations/${conversation.id}`)).body.unreadCount).toBe(2);
    expect((await as(student).post(`/api/conversations/${conversation.id}/read`, { seq: 999 })).body).toEqual({ lastReadSeq: 7 });
    expect((await as(student).get(`/api/conversations/${conversation.id}`)).body.unreadCount).toBe(0);
    expect((await as(student).post(`/api/conversations/${conversation.id}/read`, { seq: 'x' })).status).toBe(400);
  });

  test('the inbox is newest first, pages by cursor, and hides empty conversations from the teacher', async () => {
    const teacher2 = await availableTeacher();
    const students = await Promise.all([1, 2, 3].map(n => createUser('student', `chat-inbox-${n}`)));
    const convs = [];
    for (const s of students) {
      const c = await open(s, teacher2);
      convs.push(c);
      await Conversation.update({ lastMessageAt: new Date(Date.now() - (10 - convs.length) * 60e3) }, { where: { id: c.id } });
    }
    await send(students[0], convs[0].id, 'Primero');
    await send(students[1], convs[1].id, 'Segundo');
    // students[2] opened but did not write: the teacher does not see it, the student does.
    const page1 = await as(teacher2).get('/api/conversations?limit=1');
    expect(page1.body.items.map(c => c.id)).toEqual([convs[1].id]);
    expect(page1.body.items[0]).toMatchObject({ role: 'teacher', unreadCount: 1, lastMessage: { preview: 'Segundo', senderIsMe: false, type: 'text' } });
    const page2 = await as(teacher2).get(`/api/conversations?limit=1&cursor=${page1.body.nextCursor}`);
    expect(page2.body.items.map(c => c.id)).toEqual([convs[0].id]);
    expect(page2.body.nextCursor).toBeNull();
    expect((await as(students[2]).get('/api/conversations')).body.items.map(c => c.id)).toEqual([convs[2].id]);
    expect((await as(teacher2).get('/api/conversations?cursor=garbage')).status).toBe(400);
  });
});

describe('CHAT-07: anti-spam windows shared through the database', () => {
  test('before the teacher replies a student sends 10 per hour; then 429 with Retry-After and nothing stored', async () => {
    const teacher = await availableTeacher();
    const student = await createUser('student', 'chat-spam');
    const conversation = await open(student, teacher);
    for (let n = 1; n <= 10; n += 1) expect((await send(student, conversation.id, `Mensaje ${n}`)).status).toBe(201);
    const refused = await send(student, conversation.id, 'Mensaje 11');
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('rate_limited');
    expect(refused.body.params).toMatchObject({ scope: 'before_reply', limit: 10 });
    expect(new Date(refused.body.params.retryAt).getTime()).toBeGreaterThan(Date.now());
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(await Message.count({ where: { conversationId: conversation.id } })).toBe(10);

    // The window counts per student across teachers that have not replied yet.
    const another = await open(student, await availableTeacher());
    expect((await send(student, another.id, 'Hola')).status).toBe(429);

    // A retry of a message already stored is not a new hit, even over the limit.
    const firstKey = (await Message.findOne({ where: { conversationId: conversation.id, seq: 1 } })).clientMessageId;
    expect((await send(student, conversation.id, 'Mensaje 1', firstKey)).status).toBe(200);

    // Once the teacher replied, the per-conversation window (60/hour) applies instead.
    expect((await send(teacher, conversation.id, 'Hola, te leo')).status).toBe(201);
    expect((await send(student, conversation.id, 'Gracias')).status).toBe(201);
    // Course access is not affected by chat limits.
    expect((await as(student).get('/api/auth/me')).status).toBe(200);
  });

  test('a student opens at most 5 new conversations a day; reopening an existing one is free', async () => {
    const student = await createUser('student', 'chat-newconv');
    const teachers = await Promise.all([1, 2, 3, 4, 5, 6].map(() => availableTeacher()));
    for (const t of teachers.slice(0, 5)) expect((await as(student).post('/api/conversations', { teacherId: t.id })).status).toBe(201);
    const sixth = await as(student).post('/api/conversations', { teacherId: teachers[5].id });
    expect(sixth.status).toBe(429);
    expect(sixth.body.params.scope).toBe('new_conversations');
    expect(await Conversation.count({ where: { studentId: student.id } })).toBe(5);
    expect((await as(student).post('/api/conversations', { teacherId: teachers[0].id })).status).toBe(200);
  });

  test('teacher per-conversation, account and IP windows', async () => {
    const teacher = await availableTeacher();
    const student = await createUser('student', 'chat-windows');
    const conversation = await open(student, teacher);
    await send(student, conversation.id, 'Hola');

    await fillBucket(`chat:conv:${conversation.id}:user:${teacher.id}`, 120);
    const teacherRefused = await send(teacher, conversation.id, 'Mensaje 121');
    expect(teacherRefused.status).toBe(429);
    expect(teacherRefused.body.params).toMatchObject({ scope: 'conversation', limit: 120 });
    await RateLimitBucket.destroy({ where: { bucketKey: `chat:conv:${conversation.id}:user:${teacher.id}` } });

    await fillBucket(`chat:account:${teacher.id}`, 300);
    expect((await send(teacher, conversation.id, 'Cuenta')).body.params.scope).toBe('account');
    await RateLimitBucket.destroy({ where: { bucketKey: `chat:account:${teacher.id}` } });
    expect((await send(teacher, conversation.id, 'Ya puedo')).status).toBe(201);

    process.env.CHAT_IP_ACTIONS_PER_HOUR = '5';
    try {
      const ipKeys = { bucketKey: { [Op.startsWith]: 'chat:ip:' } };
      await RateLimitBucket.destroy({ where: ipKeys });
      let last;
      for (let n = 0; n < 6; n += 1) last = await send(teacher, conversation.id, `IP ${n}`);
      expect(last.status).toBe(429);
      expect(last.body.params.scope).toBe('ip');
      await RateLimitBucket.destroy({ where: ipKeys });
    } finally {
      process.env.CHAT_IP_ACTIONS_PER_HOUR = '1000000';
    }
  });
});

describe('CHAT-04/08/10: block, report, system events and moderation', () => {
  let teacher, student, moderator, conversation;
  beforeAll(async () => {
    teacher = await availableTeacher();
    student = await createUser('student', 'chat-block');
    moderator = await createUser('student', 'chat-mod');
    await moderator.update({ permissions: ['chat.moderate'] });
    conversation = await open(student, teacher);
    await send(student, conversation.id, 'Hola');
    await send(teacher, conversation.id, 'Hola, ¿cómo estás?');
  });

  test('a block stops human messages both ways, keeps the history and lets system events through', async () => {
    const blocked = await as(student).post(`/api/conversations/${conversation.id}/block`);
    expect(blocked.body).toMatchObject({ blockedByMe: true, blockedByOther: false });
    expect((await as(teacher).get(`/api/conversations/${conversation.id}`)).body).toMatchObject({ blockedByMe: false, blockedByOther: true });
    for (const user of [student, teacher]) {
      const res = await send(user, conversation.id, 'mensaje');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('conversation_blocked');
    }
    expect((await as(teacher).get(`/api/conversations/${conversation.id}/messages`)).body.items).toHaveLength(2);

    const event = await sequelize.transaction(transaction => chat.appendSystemMessage(conversation.id, {
      eventCode: 'purchase_paid', eventParams: { units: 4 }, dedupeKey: `test:${conversation.id}:paid`
    }, { transaction }));
    const again = await sequelize.transaction(transaction => chat.appendSystemMessage(conversation.id, {
      eventCode: 'purchase_paid', eventParams: { units: 4 }, dedupeKey: `test:${conversation.id}:paid`
    }, { transaction }));
    expect(Number(again.id)).toBe(Number(event.id));
    const history = await as(student).get(`/api/conversations/${conversation.id}/messages`);
    expect(history.body.items[2]).toMatchObject({ type: 'system_event', senderRole: 'system', senderId: null, mine: false, eventCode: 'purchase_paid', eventParams: { units: 4 } });

    // Clients cannot create system or commercial messages: the API only takes text.
    const forged = await as(student).post(`/api/conversations/${conversation.id}/messages`, { clientMessageId: cid(), body: 'x', type: 'offer', senderId: null });
    expect(forged.body.code).toBe('conversation_blocked');

    expect((await as(student).delete(`/api/conversations/${conversation.id}/block`)).body.blockedByMe).toBe(false);
    expect((await send(teacher, conversation.id, 'De nuevo')).status).toBe(201);
  });

  test('a report blocks, is audited, and opens the conversation to chat.moderate (audited) to hide a message', async () => {
    expect((await as(student).post(`/api/conversations/${conversation.id}/report`, { reason: '' })).status).toBe(400);
    const reported = await as(student).post(`/api/conversations/${conversation.id}/report`, { reason: 'Mensajes ofensivos' });
    expect(reported.body).toMatchObject({ reportedByMe: true, blockedByMe: true });
    expect(await AuditLog.count({ where: { action: 'conversation.report', entityId: conversation.id } })).toBe(1);

    expect((await as(student).get('/api/admin/chat/reports')).status).toBe(403);
    const reports = await as(moderator).get('/api/admin/chat/reports');
    expect(reports.body.find(r => r.conversationId === conversation.id)).toMatchObject({ reason: 'Mensajes ofensivos', reportedBy: { id: student.id, role: 'student' } });

    const read = await as(moderator).get(`/api/admin/chat/reports/${conversation.id}/messages`);
    expect(read.status).toBe(200);
    const offending = read.body.items.find(m => m.body === 'Hola, ¿cómo estás?');
    expect(await AuditLog.count({ where: { action: 'chat.report_read', entityId: conversation.id, actorId: moderator.id } })).toBe(1);

    expect((await as(moderator).post(`/api/admin/messages/${offending.id}/hide`, {})).status).toBe(400);
    const hidden = await as(moderator).post(`/api/admin/messages/${offending.id}/hide`, { reason: 'Lenguaje ofensivo' });
    expect(hidden.status).toBe(200);
    expect(hidden.body.hiddenReason).toBe('Lenguaje ofensivo');
    expect(await AuditLog.count({ where: { action: 'message.hide', entityId: offending.id } })).toBe(1);
    const seen = (await as(student).get(`/api/conversations/${conversation.id}/messages`)).body.items.find(m => m.id === offending.id);
    expect(seen).toMatchObject({ hidden: true, body: null });
    expect(seen.hiddenReason).toBeUndefined();
    expect(await Message.count({ where: { id: offending.id } })).toBe(1); // never deleted

    // Messages of a conversation nobody reported cannot be read nor hidden by a moderator.
    const outsider = await createUser('student', 'chat-unreported');
    const other = await open(outsider, teacher);
    const plain = await send(outsider, other.id, 'Consulta normal');
    expect((await as(moderator).post(`/api/admin/messages/${plain.body.id}/hide`, { reason: 'x' })).status).toBe(404);
    expect((await as(moderator).get(`/api/admin/chat/reports/${other.id}/messages`)).status).toBe(404);
  });
});

describe('CHAT-09: grouped email about unread activity', () => {
  test('one pending job per recipient, delayed; the email has no message text and is skipped once read', async () => {
    const teacher = await availableTeacher();
    await teacher.update({ locale: 'es' });
    const student = await createUser('student', 'chat-email');
    const conversation = await open(student, teacher);
    const before = Date.now();
    await send(student, conversation.id, 'Texto privado que no va al correo');
    await send(student, conversation.id, 'Otro mensaje');
    const teacherPart = await ConversationParticipant.findOne({ where: { conversationId: conversation.id, userId: teacher.id } });
    const jobs = await OutboxJob.findAll({ where: { topic: chat.EMAIL_TOPIC, aggregateType: 'conversations', aggregateId: conversation.id, dedupeKey: { [Op.startsWith]: `${chat.EMAIL_TOPIC}:${conversation.id}:${teacher.id}:` } } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].runAt.getTime()).toBeGreaterThanOrEqual(before + 5 * 60e3 - 1000);
    // The sender gets no job for their own messages.
    const studentPart = await ConversationParticipant.findOne({ where: { conversationId: conversation.id, userId: student.id } });
    expect(await OutboxJob.count({ where: { topic: chat.EMAIL_TOPIC, dedupeKey: { [Op.startsWith]: `${chat.EMAIL_TOPIC}:${conversation.id}:${student.id}:` } } })).toBe(0);
    expect(studentPart).toBeTruthy();

    clearOutbox();
    await chat.sendUnreadEmail(jobs[0]);
    const mails = getOutbox().filter(m => m.to === teacher.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain('2 mensajes nuevos');
    expect(mails[0].text).not.toContain('Texto privado');
    expect(mails[0].html).not.toContain('Texto privado');
    expect(mails[0].text).toContain(`/messages/${conversation.id}`);
    await teacherPart.reload();
    expect(teacherPart.emailNotifiedSeq).toBe(2);

    // Already notified: running the job again sends nothing (idempotent handler).
    clearOutbox();
    await chat.sendUnreadEmail(jobs[0]);
    expect(getOutbox()).toHaveLength(0);

    // The next one waits 30 minutes after the previous email, and is skipped if the teacher read in between.
    await OutboxJob.update({ status: 'done', doneAt: new Date() }, { where: { id: jobs[0].id } });
    await send(student, conversation.id, 'Tercero');
    const next = await OutboxJob.findOne({ where: { topic: chat.EMAIL_TOPIC, aggregateId: conversation.id, status: 'pending' } });
    expect(next.runAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 29 * 60e3);
    await as(teacher).post(`/api/conversations/${conversation.id}/read`, { seq: 3 });
    clearOutbox();
    await chat.sendUnreadEmail(next);
    expect(getOutbox()).toHaveLength(0);
  });
});

describe('CHAT-09: the recipient\'s language and email preference', () => {
  const pendingJob = (recipient, conversationId) => OutboxJob.findOne({
    where: { topic: chat.EMAIL_TOPIC, aggregateType: 'conversations', aggregateId: conversationId, status: 'pending', dedupeKey: { [Op.startsWith]: `${chat.EMAIL_TOPIC}:${conversationId}:${recipient.id}:` } }
  });

  test('without a chosen language the email is in English (W01 rule)', async () => {
    const teacher = await availableTeacher();
    const student = await createUser('student', 'chat-email-en');
    const conversation = await open(student, teacher);
    await send(student, conversation.id, 'Hello');
    clearOutbox();
    await chat.sendUnreadEmail(await pendingJob(teacher, conversation.id));
    const [mail] = getOutbox().filter(m => m.to === teacher.email);
    expect(mail.subject).toBe(`You have a new message from ${student.name}`);
    expect(mail.text).not.toContain('Hello');
  });

  test('a user who turned the email off through /api/me/preferences gets none', async () => {
    const teacher = await availableTeacher();
    const student = await createUser('student', 'chat-email-off');
    const conversation = await open(student, teacher);
    const off = await require('supertest')(require('../src/app')).patch('/api/me/preferences')
      .set('Authorization', `Bearer ${teacher.token}`).send({ chatUnreadEmail: false });
    expect(off.body.chatUnreadEmail).toBe(false);
    await send(student, conversation.id, 'Hola');
    clearOutbox();
    await chat.sendUnreadEmail(await pendingJob(teacher, conversation.id));
    expect(getOutbox()).toHaveLength(0);
  });
});

describe('CHAT-09 / CONTRACT-05: queued emails follow the switch and the test-account cleanup', () => {
  test('turning CHAT_UNREAD_EMAIL off after a job was queued stops that email', async () => {
    const teacher = await availableTeacher();
    const student = await createUser('student', 'chat-email-global');
    const conversation = await open(student, teacher);
    await send(student, conversation.id, 'Hola');
    const job = await OutboxJob.findOne({ where: { topic: chat.EMAIL_TOPIC, aggregateType: 'conversations', aggregateId: conversation.id, status: 'pending' } });
    expect(job).toBeTruthy();
    process.env.CHAT_UNREAD_EMAIL = '0';
    try {
      clearOutbox();
      await chat.sendUnreadEmail(job);
      expect(getOutbox()).toHaveLength(0);
    } finally {
      delete process.env.CHAT_UNREAD_EMAIL;
    }
  });

  test('deleting test accounts leaves no chat email job behind', async () => {
    const { User } = require('../src/models');
    const { deleteTestUser } = require('../src/services/adminUsers');
    const tag = Date.now();
    const teacher = await User.create({ name: 'Docente prueba', email: `chat-t-${tag}@spanishnow.test`, password: 'jest-password-1', role: 'teacher', isTestAccount: true });
    const student = await User.create({ name: 'Alumna prueba', email: `chat-s-${tag}@spanishnow.test`, password: 'jest-password-1', role: 'student', isTestAccount: true });
    await TeacherClassSettings.create({ userId: teacher.id, classesEnabledAt: new Date(), acceptsInquiries: true });
    const { tokenFor } = require('./helpers/fixtures');
    Object.assign(teacher, { token: tokenFor(teacher) });
    Object.assign(student, { token: tokenFor(student) });
    const conversation = await open(student, teacher);
    await send(student, conversation.id, 'Hola');
    await send(teacher, conversation.id, 'Hola, te leo');
    expect(await OutboxJob.count({ where: { topic: chat.EMAIL_TOPIC, aggregateId: conversation.id } })).toBe(2);
    await deleteTestUser(student.id);
    await deleteTestUser(teacher.id);
    expect(await Conversation.count({ where: { id: conversation.id } })).toBe(0);
    expect(await OutboxJob.count({ where: { topic: chat.EMAIL_TOPIC, aggregateId: conversation.id } })).toBe(0);
    expect(await OutboxJob.count({ where: { topic: chat.EMAIL_TOPIC, dedupeKey: { [Op.startsWith]: `${chat.EMAIL_TOPIC}:${conversation.id}:` } } })).toBe(0);
  });
});
