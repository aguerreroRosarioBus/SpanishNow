// Private teacher–student chat (SPEC §6, CONTRATO.md §3.3 and §9.2).
// - One conversation per teacher–student pair; only its two participants can read it (CHAT-02). Admin permissions
//   give no access: chat.moderate only reaches reported conversations, and every read is audited.
// - Every message gets a server sequence under the conversation's row lock; history pages by that seq (CHAT-03).
// - Sending is idempotent per sender and conversation through clientMessageId (CHAT-03).
// - Anti-spam limits are fixed windows shared by replicas (CHAT-07); read cursors only move forward (CHAT-10).
// - Unread activity is emailed through the outbox, grouped, without the message text, in the recipient's locale and
//   only if they keep users.chatUnreadEmail on (CHAT-09).
const { Op, QueryTypes, UniqueConstraintError } = require('sequelize');
const sequelize = require('../config/database');
const {
  User, TeacherClassSettings, Conversation, ConversationParticipant, Message, ClassPolicyVersion, Course,
  ClassPackageTemplate, ClassPackageTemplateVersion, ClassSession, ClassSessionParticipant, OutboxJob, AuditLog
} = require('../models');
const { DEFAULT_POLICY_V1 } = require('../domain/classPolicy');
const rateLimit = require('./rateLimit');
const outbox = require('./outbox');
const { sendMail } = require('./mailService');
const { chatUnread } = require('./emailTemplates');

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CONTEXT_TYPES = ['course', 'package', 'session'];
const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;
const PREVIEW_LENGTH = 140;
const EMAIL_TOPIC = 'email.chat_unread';

// Aggregate limits per account and per IP, over every conversation (CHAT-07). They are not commercial rules, so they
// are not part of the versioned policy; env vars override them.
const envInt = (name, fallback) => (Number.isSafeInteger(Number(process.env[name])) && Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);
const accountMessagesPerHour = () => envInt('CHAT_ACCOUNT_MESSAGES_PER_HOUR', 300);
const ipActionsPerHour = () => envInt('CHAT_IP_ACTIONS_PER_HOUR', 600);
const emailDelayMs = () => envInt('CHAT_UNREAD_EMAIL_DELAY_MINUTES', 5) * 60e3;
const emailIntervalMs = () => envInt('CHAT_UNREAD_EMAIL_INTERVAL_MINUTES', 30) * 60e3;
const emailEnabled = () => process.env.CHAT_UNREAD_EMAIL !== '0';

class ChatError extends Error {
  constructor(statusCode, code, message, params = {}) {
    super(message);
    this.name = 'ChatError';
    this.statusCode = statusCode;
    this.code = code;
    this.params = params;
  }

  get status() { return this.statusCode; }
}

const notFound = () => new ChatError(404, 'not_found', 'Conversación no encontrada');
const invalid = (fields, message = 'Datos inválidos') => new ChatError(400, 'validation_failed', message, { fields });

/** Rules of the newest policy version (CONTRATO.md §5); the V1 defaults while none is stored. */
async function currentRules({ transaction } = {}) {
  const latest = await ClassPolicyVersion.findOne({ order: [['version', 'DESC']], transaction });
  return { ...DEFAULT_POLICY_V1, ...(latest ? latest.rules : {}) };
}

const isAvailableTeacher = (teacher, settings) => Boolean(
  teacher && teacher.role === 'teacher' && !teacher.suspendedAt && settings && settings.classesEnabledAt && settings.acceptsInquiries
);

/** Teachers a student can write to (CHAT-01). */
async function listAvailableTeachers() {
  const rows = await TeacherClassSettings.findAll({
    where: { classesEnabledAt: { [Op.ne]: null }, acceptsInquiries: true },
    include: [{ model: User, as: 'teacher', attributes: ['id', 'name', 'role', 'suspendedAt'], required: true }]
  });
  return rows
    .filter(row => isAvailableTeacher(row.teacher, row))
    .map(row => ({ id: row.teacher.id, name: row.teacher.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validates an optional { type, id } context against the pair: a course or package of that teacher, or a session of
 * that teacher where the student takes part. Returns { contextType, contextId } or nulls.
 */
async function resolveContext(context, { teacherId, studentId }, { transaction } = {}) {
  if (context === undefined || context === null) return { contextType: null, contextId: null };
  const id = Number(context && context.id);
  if (typeof context !== 'object' || !CONTEXT_TYPES.includes(context.type) || !Number.isSafeInteger(id) || id <= 0) throw invalid(['context']);
  let found;
  if (context.type === 'course') found = await Course.findOne({ where: { id, teacherId }, attributes: ['id'], transaction });
  else if (context.type === 'package') found = await ClassPackageTemplate.findOne({ where: { id, teacherId }, attributes: ['id'], transaction });
  else {
    found = await ClassSession.findOne({ where: { id, teacherId }, attributes: ['id'], transaction });
    if (found) found = await ClassSessionParticipant.findOne({ where: { sessionId: id, userId: studentId }, attributes: ['id'], transaction });
  }
  if (!found) throw invalid(['context']);
  return { contextType: context.type, contextId: id };
}

/** Titles of contexts, for the inbox and headers: Map "type:id" -> title (only courses and packages have one). */
async function contextTitles(pairs) {
  const titles = new Map();
  const ids = type => [...new Set(pairs.filter(p => p.contextType === type).map(p => p.contextId))];
  const courseIds = ids('course');
  if (courseIds.length) {
    for (const course of await Course.findAll({ where: { id: courseIds }, attributes: ['id', 'title'] })) titles.set(`course:${course.id}`, { es: course.title, en: course.title });
  }
  const packageIds = ids('package');
  if (packageIds.length) {
    const templates = await ClassPackageTemplate.findAll({ where: { id: packageIds }, attributes: ['id', 'currentVersionId'] });
    const versionIds = templates.map(t => t.currentVersionId).filter(Boolean);
    const versions = versionIds.length ? await ClassPackageTemplateVersion.findAll({ where: { id: versionIds }, attributes: ['id', 'nameEs', 'nameEn'] }) : [];
    const byId = new Map(versions.map(v => [v.id, v]));
    for (const t of templates) {
      const v = byId.get(t.currentVersionId);
      if (v) titles.set(`package:${t.id}`, { es: v.nameEs, en: v.nameEn });
    }
  }
  return titles;
}

const presentContext = (contextType, contextId, titles = new Map()) => (contextType
  ? { type: contextType, id: contextId, title: titles.get(`${contextType}:${contextId}`) || null }
  : null);

/** Message as its participants see it. Hidden messages keep their place and references but lose their text. */
function presentMessage(message, viewer, roles) {
  const hidden = Boolean(message.hiddenAt);
  const mine = message.senderId !== null && message.senderId === viewer.id;
  return {
    id: Number(message.id),
    seq: message.seq,
    type: message.type,
    senderId: message.senderId,
    senderRole: message.senderId === null ? 'system' : (roles.get(message.senderId) || null),
    mine,
    body: hidden ? null : message.body,
    hidden,
    clientMessageId: mine ? message.clientMessageId : null,
    context: presentContext(message.contextType, message.contextId),
    offerId: message.offerId,
    classSessionId: message.classSessionId,
    proposalVersion: message.proposalVersion,
    eventCode: message.eventCode,
    eventParams: message.eventParams,
    createdAt: message.createdAt
  };
}

/** Loads the conversation and the user's participant row; 404 for anyone else (CONTRACT-02). */
async function loadForParticipant(user, conversationId, { transaction, lock } = {}) {
  const id = Number(conversationId);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  const conversation = await Conversation.findByPk(id, { transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!conversation) throw notFound();
  const participants = await ConversationParticipant.findAll({ where: { conversationId: id }, transaction });
  const me = participants.find(p => p.userId === user.id);
  if (!me) throw notFound();
  const other = participants.find(p => p.userId !== user.id);
  return { conversation, me, other, participants };
}

const isBlocked = participants => participants.some(p => p.blockedAt);

async function presentConversation(conversation, me, other, { unreadCount = null, lastMessage = null, context = null, counterpart = null } = {}) {
  const otherUser = counterpart || await User.findByPk(other.userId, { attributes: ['id', 'name', 'role'] });
  return {
    id: conversation.id,
    role: me.role,
    counterpart: { id: otherUser.id, name: otherUser.name, role: other.role },
    context,
    lastMessage,
    lastMessageSeq: conversation.lastMessageSeq,
    lastMessageAt: conversation.lastMessageSeq ? conversation.lastMessageAt : null,
    lastReadSeq: me.lastReadSeq,
    unreadCount,
    teacherReplied: Boolean(conversation.teacherFirstReplyAt),
    blockedByMe: Boolean(me.blockedAt),
    blockedByOther: Boolean(other.blockedAt),
    reportedByMe: Boolean(me.reportedAt),
    createdAt: conversation.createdAt
  };
}

/**
 * A student opens (or gets back) the conversation with a teacher (CHAT-01/02). Only a new conversation counts against
 * newConversationsPerDay; the existing one is returned even if the teacher stopped taking inquiries.
 * Returns { conversation, created }.
 */
async function startConversation(user, { teacherId, context } = {}, { ip = null } = {}) {
  if (user.role !== 'student') throw new ChatError(403, 'forbidden', 'Solo un alumno puede iniciar una consulta');
  const tid = Number(teacherId);
  if (!Number.isSafeInteger(tid) || tid <= 0) throw invalid(['teacherId']);
  const where = { teacherId: tid, studentId: user.id };
  const respond = async (conversation, created) => ({ conversation: await getConversation(user, conversation.id), created });

  const existing = await Conversation.findOne({ where });
  if (existing) return respond(existing, false);

  const teacher = await User.findByPk(tid, { attributes: ['id', 'role', 'suspendedAt'] });
  const settings = teacher && await TeacherClassSettings.findByPk(tid);
  if (!isAvailableTeacher(teacher, settings)) {
    if (!teacher || teacher.role !== 'teacher') throw new ChatError(404, 'not_found', 'Docente no encontrado');
    throw new ChatError(409, 'teacher_unavailable', 'Este docente no recibe consultas por ahora');
  }
  await resolveContext(context, { teacherId: tid, studentId: user.id });
  const rules = await currentRules();
  try {
    const conversation = await withDeadlockRetry(() => sequelize.transaction(async transaction => {
      const now = new Date();
      await rateLimit.hit({ bucketKey: `chat:newconv:student:${user.id}`, windowMs: DAY, limit: rules.chatLimits.newConversationsPerDay, now, scope: 'new_conversations' }, { transaction });
      if (ip) await rateLimit.hit({ bucketKey: `chat:ip:${ip}`, windowMs: HOUR, limit: ipActionsPerHour(), now, scope: 'ip' }, { transaction });
      const created = await Conversation.create({ ...where, createdById: user.id, lastMessageAt: now }, { transaction });
      await ConversationParticipant.bulkCreate([
        { conversationId: created.id, userId: tid, role: 'teacher' },
        { conversationId: created.id, userId: user.id, role: 'student' }
      ], { transaction });
      return created;
    }));
    return respond(conversation, true);
  } catch (error) {
    // Two tabs opening the same pair at once: the unique (teacherId, studentId) wins and both get one conversation.
    if (error instanceof UniqueConstraintError) return respond(await Conversation.findOne({ where }), false);
    throw error;
  }
}

const encodeCursor = (at, id) => Buffer.from(JSON.stringify({ t: new Date(at).toISOString(), id })).toString('base64url');
function decodeCursor(cursor) {
  try {
    const { t, id } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const at = new Date(t);
    if (Number.isNaN(at.getTime()) || !Number.isSafeInteger(id)) throw new Error('bad cursor');
    return { at, id };
  } catch (error) {
    throw invalid(['cursor']);
  }
}

const pageSize = (value, fallback = PAGE_DEFAULT) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw invalid(['limit']);
  return Math.min(n, PAGE_MAX);
};

const preview = message => {
  if (!message) return null;
  const hidden = Boolean(message.hiddenAt);
  const text = !hidden && message.type === 'text' && message.body ? message.body : null;
  return {
    seq: message.seq,
    type: message.type,
    senderIsMe: null, // filled by the caller
    preview: text && text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text,
    eventCode: message.eventCode,
    hidden,
    createdAt: message.createdAt
  };
};

/**
 * The user's inbox, newest activity first, paged by an opaque cursor (CHAT-03). A teacher does not see a conversation
 * until it has its first message. Returns { items, nextCursor }.
 */
async function listConversations(user, { cursor, limit } = {}) {
  const size = pageSize(limit, 20);
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await sequelize.query(
    `SELECT c.id, c.lastMessageAt, p.id AS participantId
       FROM conversation_participants p
       JOIN conversations c ON c.id = p.conversationId
      WHERE p.userId = :me AND (p.role = 'student' OR c.lastMessageSeq > 0)
        ${after ? 'AND (c.lastMessageAt < :at OR (c.lastMessageAt = :at AND c.id < :id))' : ''}
      ORDER BY c.lastMessageAt DESC, c.id DESC
      LIMIT :take`,
    { replacements: { me: user.id, at: after && rateLimit.utc(after.at), id: after && after.id, take: size + 1 }, type: QueryTypes.SELECT }
  );
  const page = rows.slice(0, size);
  const nextCursor = rows.length > size ? encodeCursor(page[page.length - 1].lastMessageAt, page[page.length - 1].id) : null;
  if (!page.length) return { items: [], nextCursor };
  const ids = page.map(r => r.id);

  const [conversations, participants, unread, contexts] = await Promise.all([
    Conversation.findAll({ where: { id: ids } }),
    ConversationParticipant.findAll({ where: { conversationId: ids }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'role'] }] }),
    sequelize.query(
      `SELECT m.conversationId, COUNT(*) AS n FROM messages m
         JOIN conversation_participants p ON p.conversationId = m.conversationId AND p.userId = :me
        WHERE m.conversationId IN (:ids) AND m.seq > p.lastReadSeq AND m.hiddenAt IS NULL AND (m.senderId IS NULL OR m.senderId <> :me)
        GROUP BY m.conversationId`,
      { replacements: { me: user.id, ids }, type: QueryTypes.SELECT }
    ),
    // Context of a conversation = context of its latest message that has one.
    sequelize.query(
      `SELECT m.conversationId, m.contextType, m.contextId FROM messages m
        WHERE m.conversationId IN (:ids) AND m.seq = (
          SELECT MAX(m2.seq) FROM messages m2 WHERE m2.conversationId = m.conversationId AND m2.contextType IS NOT NULL)`,
      { replacements: { ids }, type: QueryTypes.SELECT }
    )
  ]);
  const withMessages = conversations.filter(c => c.lastMessageSeq > 0);
  const lastMessages = withMessages.length
    ? await Message.findAll({ where: { [Op.or]: withMessages.map(c => ({ conversationId: c.id, seq: c.lastMessageSeq })) } })
    : [];
  const titles = await contextTitles(contexts);
  const byId = new Map(conversations.map(c => [c.id, c]));
  const unreadBy = new Map(unread.map(u => [u.conversationId, Number(u.n)]));
  const contextBy = new Map(contexts.map(c => [c.conversationId, presentContext(c.contextType, c.contextId, titles)]));
  const lastBy = new Map(lastMessages.map(m => [m.conversationId, m]));

  const items = [];
  for (const id of ids) {
    const conversation = byId.get(id);
    const me = participants.find(p => p.conversationId === id && p.userId === user.id);
    const other = participants.find(p => p.conversationId === id && p.userId !== user.id);
    const last = preview(lastBy.get(id));
    if (last) last.senderIsMe = lastBy.get(id).senderId === user.id;
    items.push(await presentConversation(conversation, me, other, {
      unreadCount: unreadBy.get(id) || 0, lastMessage: last, context: contextBy.get(id) || null, counterpart: other.user
    }));
  }
  return { items, nextCursor };
}

/** Totals for the navigation badge (in-app notification, CHAT-09). */
async function unreadSummary(user) {
  const [row] = await sequelize.query(
    `SELECT COUNT(DISTINCT m.conversationId) AS conversations, COUNT(*) AS messages
       FROM conversation_participants p
       JOIN messages m ON m.conversationId = p.conversationId AND m.seq > p.lastReadSeq
      WHERE p.userId = :me AND m.hiddenAt IS NULL AND (m.senderId IS NULL OR m.senderId <> :me)`,
    { replacements: { me: user.id }, type: QueryTypes.SELECT }
  );
  return { conversations: Number(row.conversations), messages: Number(row.messages) };
}

async function getConversation(user, conversationId) {
  const { conversation, me, other } = await loadForParticipant(user, conversationId);
  const [ctx] = await sequelize.query(
    'SELECT contextType, contextId FROM messages WHERE conversationId = ? AND contextType IS NOT NULL ORDER BY seq DESC LIMIT 1',
    { replacements: [conversation.id], type: QueryTypes.SELECT }
  );
  const titles = ctx ? await contextTitles([ctx]) : new Map();
  const [{ n }] = await sequelize.query(
    'SELECT COUNT(*) AS n FROM messages WHERE conversationId = ? AND seq > ? AND hiddenAt IS NULL AND (senderId IS NULL OR senderId <> ?)',
    { replacements: [conversation.id, me.lastReadSeq, user.id], type: QueryTypes.SELECT }
  );
  return presentConversation(conversation, me, other, { unreadCount: Number(n), context: ctx ? presentContext(ctx.contextType, ctx.contextId, titles) : null });
}

const seqParam = (value, field) => {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw invalid([field]);
  return n;
};

/**
 * History by server seq (CHAT-03), always returned oldest first:
 * - no cursor: the latest `limit` messages; `beforeSeq`: the `limit` messages before it (older pages);
 * - `afterSeq`: the next `limit` messages after it (polling for new ones).
 * Returns { items, hasMore } where hasMore says whether more exist in the requested direction.
 */
async function listMessages(user, conversationId, { beforeSeq, afterSeq, limit } = {}) {
  const { conversation, participants } = await loadForParticipant(user, conversationId);
  const before = seqParam(beforeSeq, 'beforeSeq');
  const after = seqParam(afterSeq, 'afterSeq');
  if (before !== null && after !== null) throw invalid(['beforeSeq', 'afterSeq'], 'Usá beforeSeq o afterSeq, no ambos');
  const size = pageSize(limit);
  const where = { conversationId: conversation.id };
  if (before !== null) where.seq = { [Op.lt]: before };
  if (after !== null) where.seq = { [Op.gt]: after };
  const rows = await Message.findAll({ where, order: [['seq', after !== null ? 'ASC' : 'DESC']], limit: size + 1 });
  const hasMore = rows.length > size;
  const page = rows.slice(0, size);
  if (after === null) page.reverse();
  const roles = new Map(participants.map(p => [p.userId, p.role]));
  return { items: page.map(m => presentMessage(m, user, roles)), hasMore };
}

/** Normalizes a human text: plain text, \n line breaks, no control characters. Returns the text or throws. */
function normalizeBody(body, maxLength) {
  if (typeof body !== 'string') throw invalid(['body']);
  // eslint-disable-next-line no-control-regex
  const text = body.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (!text.trim()) throw invalid(['body'], 'El mensaje está vacío');
  if ([...text].length > maxLength) throw new ChatError(400, 'message_too_long', `El mensaje supera ${maxLength} caracteres`, { max: maxLength });
  return text;
}

/** The anti-spam windows that apply to one human message (CHAT-07). */
function messageLimits({ user, me, conversation, rules, ip }) {
  const { chatLimits } = rules;
  const limits = [];
  if (me.role === 'student' && !conversation.teacherFirstReplyAt) {
    limits.push({ bucketKey: `chat:prereply:student:${user.id}`, windowMs: HOUR, limit: chatLimits.messagesPerHourBeforeReply, scope: 'before_reply' });
  } else {
    const limit = me.role === 'teacher' ? chatLimits.teacherMessagesPerHourPerConversation : chatLimits.messagesPerHourPerConversation;
    limits.push({ bucketKey: `chat:conv:${conversation.id}:user:${user.id}`, windowMs: HOUR, limit, scope: 'conversation' });
  }
  limits.push({ bucketKey: `chat:account:${user.id}`, windowMs: HOUR, limit: accountMessagesPerHour(), scope: 'account' });
  if (ip) limits.push({ bucketKey: `chat:ip:${ip}`, windowMs: HOUR, limit: ipActionsPerHour(), scope: 'ip' });
  return limits;
}

/** Appends a message under the conversation lock (already held) and schedules the unread email of the others. */
async function append(conversation, participants, fields, { transaction, now = new Date() }) {
  const seq = conversation.lastMessageSeq + 1;
  const message = await Message.create({ ...fields, conversationId: conversation.id, seq, createdAt: now }, { transaction });
  const changes = { lastMessageSeq: seq, lastMessageAt: now };
  const sender = participants.find(p => p.userId === fields.senderId);
  if (sender && sender.role === 'teacher' && !conversation.teacherFirstReplyAt) changes.teacherFirstReplyAt = now;
  await conversation.update(changes, { transaction });
  for (const recipient of participants) {
    if (recipient.userId !== fields.senderId) await scheduleUnreadEmail(recipient, seq, { transaction, now });
  }
  return message;
}

// New rate-limit rows inserted at once can deadlock in InnoDB; one side is rolled back and simply tries again.
const isDeadlock = error => Boolean(error && error.parent && ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.parent.code));
async function withDeadlockRetry(work, attempts = 3) {
  for (let i = 1; ; i += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isDeadlock(error) || i >= attempts) throw error;
    }
  }
}

/**
 * A participant sends a text (CHAT-03/05/07/08). The same clientMessageId from the same sender returns the message
 * already stored (200) instead of a second one; reused with another text it is a 409 operation_key_conflict.
 * Returns { message, created }.
 */
async function sendMessage(user, conversationId, { clientMessageId, body, context } = {}, { ip = null } = {}) {
  if (typeof clientMessageId !== 'string' || !CLIENT_MESSAGE_ID.test(clientMessageId)) throw invalid(['clientMessageId']);
  const rules = await currentRules();
  const text = normalizeBody(body, rules.chatMaxMessageLength);
  // Retrying is safe: the clientMessageId check runs again inside the new transaction.
  return withDeadlockRetry(() => sequelize.transaction(async transaction => {
    const { conversation, me, participants } = await loadForParticipant(user, conversationId, { transaction, lock: true });
    const roles = new Map(participants.map(p => [p.userId, p.role]));
    const repeated = await Message.findOne({ where: { conversationId: conversation.id, senderId: user.id, clientMessageId }, transaction });
    if (repeated) {
      if (repeated.body !== text) throw new ChatError(409, 'operation_key_conflict', 'Ese clientMessageId ya se usó con otro texto', { clientMessageId });
      return { message: presentMessage(repeated, user, roles), created: false };
    }
    if (isBlocked(participants)) throw new ChatError(409, 'conversation_blocked', 'No se pueden enviar mensajes en esta conversación');
    const ctx = await resolveContext(context, { teacherId: conversation.teacherId, studentId: conversation.studentId }, { transaction });
    const now = new Date();
    for (const limit of messageLimits({ user, me, conversation, rules, ip })) await rateLimit.hit({ ...limit, now }, { transaction });
    const message = await append(conversation, participants, { senderId: user.id, type: 'text', body: text, clientMessageId, ...ctx }, { transaction, now });
    return { message: presentMessage(message, user, roles), created: true };
  }));
}

/**
 * Backend-only messages (offers, session proposals, system events; CHAT-04) for W05/W06. Run inside the caller's
 * transaction; they bypass blocks and limits because they record commercial facts. `dedupeKey` (e.g.
 * `offer:<id>:sent`) makes a retry return the first message: it is stored as the clientMessageId of a null sender.
 */
async function appendSystemMessage(conversationId, { type = 'system_event', eventCode, eventParams = null, offerId = null, classSessionId = null, proposalVersion = null, dedupeKey, contextType = null, contextId = null }, { transaction }) {
  if (!transaction) throw new Error('appendSystemMessage needs the business transaction');
  if (!['offer', 'session_proposal', 'system_event'].includes(type)) throw new Error(`Invalid system message type ${type}`);
  if (!eventCode || !dedupeKey || !CLIENT_MESSAGE_ID.test(dedupeKey.replace(/[:.]/g, '_'))) throw new Error('appendSystemMessage needs eventCode and dedupeKey');
  const key = dedupeKey.replace(/[:.]/g, '_');
  const conversation = await Conversation.findByPk(conversationId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);
  // senderId IS NULL defeats the unique index (NULLs never collide), so the lock above is what keeps this unique.
  const existing = await Message.findOne({ where: { conversationId, senderId: null, clientMessageId: key }, transaction });
  if (existing) return existing;
  const participants = await ConversationParticipant.findAll({ where: { conversationId }, transaction });
  return append(conversation, participants, {
    senderId: null, type, clientMessageId: key, eventCode, eventParams, offerId, classSessionId, proposalVersion, contextType, contextId
  }, { transaction });
}

/** Moves the read cursor forward to `seq` (never back, never past the last message; CHAT-10). */
async function markRead(user, conversationId, seq) {
  const target = Number(seq);
  if (!Number.isSafeInteger(target) || target < 0) throw invalid(['seq']);
  const { conversation, me } = await loadForParticipant(user, conversationId);
  await sequelize.query(
    'UPDATE conversation_participants SET lastReadSeq = GREATEST(lastReadSeq, LEAST(?, ?)), updatedAt = ? WHERE id = ?',
    { replacements: [target, conversation.lastMessageSeq, rateLimit.utc(new Date()), me.id] }
  );
  await me.reload({ attributes: ['lastReadSeq'] });
  return { lastReadSeq: me.lastReadSeq };
}

/** Blocks or unblocks the contact from this side (CHAT-08). History, offers and classes stay as they are. */
async function setBlocked(user, conversationId, blocked) {
  const { conversation, me, other } = await loadForParticipant(user, conversationId);
  if (Boolean(me.blockedAt) !== blocked) await me.update({ blockedAt: blocked ? new Date() : null });
  return presentConversation(conversation, me, other);
}

/** Reports the contact (CHAT-08); it also blocks, so the reporter stops receiving messages. */
async function report(user, conversationId, reason) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > 500) throw invalid(['reason'], 'Contanos el motivo (hasta 500 caracteres)');
  const { conversation, me, other } = await loadForParticipant(user, conversationId);
  await sequelize.transaction(async transaction => {
    const now = new Date();
    await me.update({ reportedAt: now, reportReason: text, blockedAt: me.blockedAt || now }, { transaction });
    await AuditLog.create({ actorId: user.id, action: 'conversation.report', entityType: 'conversation', entityId: conversation.id, reason: text }, { transaction });
  });
  return presentConversation(conversation, me, other);
}

// --- Moderation (chat.moderate): only reported conversations, every read and hide audited (CHAT-02, CHAT-10) ---

async function reportedConversation(conversationId, { transaction } = {}) {
  const id = Number(conversationId);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  const reported = await ConversationParticipant.findOne({ where: { conversationId: id, reportedAt: { [Op.ne]: null } }, transaction });
  if (!reported) throw notFound();
  return Conversation.findByPk(id, { transaction });
}

/** Reported conversations, newest report first, without message text. */
async function listReports() {
  const reports = await ConversationParticipant.findAll({
    where: { reportedAt: { [Op.ne]: null } },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'role'] }],
    order: [['reportedAt', 'DESC']],
    limit: 200
  });
  const conversations = await Conversation.findAll({
    where: { id: [...new Set(reports.map(r => r.conversationId))] },
    include: [{ model: User, as: 'teacher', attributes: ['id', 'name'] }, { model: User, as: 'student', attributes: ['id', 'name'] }]
  });
  const byId = new Map(conversations.map(c => [c.id, c]));
  return reports.map(r => {
    const c = byId.get(r.conversationId);
    return {
      conversationId: r.conversationId,
      reportedBy: { id: r.user.id, name: r.user.name, role: r.role },
      reportedAt: r.reportedAt,
      reason: r.reportReason,
      teacher: c.teacher && { id: c.teacher.id, name: c.teacher.name },
      student: c.student && { id: c.student.id, name: c.student.name }
    };
  });
}

/** A moderator reads a reported conversation (hidden text included, so it can be reviewed). Audited. */
async function readReportedMessages(moderator, conversationId, { beforeSeq, limit } = {}, { impersonatedById = null } = {}) {
  const conversation = await reportedConversation(conversationId);
  const before = seqParam(beforeSeq, 'beforeSeq');
  const size = pageSize(limit);
  const rows = await Message.findAll({
    where: { conversationId: conversation.id, ...(before !== null ? { seq: { [Op.lt]: before } } : {}) },
    order: [['seq', 'DESC']], limit: size + 1
  });
  const page = rows.slice(0, size).reverse();
  await AuditLog.create({
    actorId: moderator.id, impersonatedById, action: 'chat.report_read', entityType: 'conversation', entityId: conversation.id,
    data: { fromSeq: page.length ? page[0].seq : null, toSeq: page.length ? page[page.length - 1].seq : null }
  });
  const participants = await ConversationParticipant.findAll({ where: { conversationId: conversation.id } });
  const roles = new Map(participants.map(p => [p.userId, p.role]));
  return {
    items: page.map(m => ({ ...presentMessage(m, moderator, roles), body: m.body, hiddenReason: m.hiddenReason })),
    hasMore: rows.length > size
  };
}

/** Hides a message of a reported conversation with a reason (CHAT-10). The row and its references stay. */
async function hideMessage(moderator, messageId, reason, { impersonatedById = null } = {}) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > 500) throw invalid(['reason'], 'Indicá el motivo (hasta 500 caracteres)');
  const id = Number(messageId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ChatError(404, 'not_found', 'Mensaje no encontrado');
  return sequelize.transaction(async transaction => {
    const message = await Message.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!message) throw new ChatError(404, 'not_found', 'Mensaje no encontrado');
    await reportedConversation(message.conversationId, { transaction });
    if (!message.hiddenAt) {
      await message.update({ hiddenAt: new Date(), hiddenById: moderator.id, hiddenReason: text }, { transaction });
      await AuditLog.create({
        actorId: moderator.id, impersonatedById, action: 'message.hide', entityType: 'message', entityId: Number(message.id), reason: text,
        data: { conversationId: message.conversationId, seq: message.seq }
      }, { transaction });
    }
    return { id: Number(message.id), conversationId: message.conversationId, seq: message.seq, hiddenAt: message.hiddenAt, hiddenReason: message.hiddenReason };
  });
}

// --- Grouped email about unread activity (CHAT-09) ---

/**
 * At most one pending email job per recipient and conversation. It waits CHAT_UNREAD_EMAIL_DELAY_MINUTES (5) and keeps
 * CHAT_UNREAD_EMAIL_INTERVAL_MINUTES (30) since the previous one; a message arriving while one is pending rides on it.
 */
async function scheduleUnreadEmail(participant, seq, { transaction, now }) {
  if (!emailEnabled()) return;
  const aggregate = { topic: EMAIL_TOPIC, aggregateType: 'conversation_participant', aggregateId: participant.id };
  const pending = await OutboxJob.findOne({ where: { ...aggregate, status: 'pending' }, attributes: ['id'], transaction });
  if (pending) return;
  const previous = await OutboxJob.findOne({
    where: { ...aggregate, status: ['done', 'running'] }, order: [['runAt', 'DESC']], attributes: ['runAt', 'doneAt'], transaction
  });
  const last = previous ? (previous.doneAt || previous.runAt).getTime() : 0;
  const runAt = new Date(Math.max(now.getTime() + emailDelayMs(), last + emailIntervalMs()));
  await outbox.enqueue({
    ...aggregate, dedupeKey: `${EMAIL_TOPIC}:${participant.id}:${seq}`, runAt, payload: { conversationId: participant.conversationId, userId: participant.userId, seq }
  }, { transaction });
}

/** Outbox handler: emails the recipient only if something is still unread and not yet notified. Idempotent. */
async function sendUnreadEmail(job, ctx = {}) {
  const { conversationId, userId } = job.payload || {};
  const participant = await ConversationParticipant.findOne({ where: { conversationId, userId } });
  if (!participant || participant.blockedAt) return;
  const since = Math.max(participant.lastReadSeq, participant.emailNotifiedSeq);
  const pending = await Message.findAll({
    where: { conversationId, seq: { [Op.gt]: since }, hiddenAt: null, [Op.or]: [{ senderId: null }, { senderId: { [Op.ne]: userId } }] },
    attributes: ['seq'], order: [['seq', 'DESC']]
  });
  if (!pending.length) return;
  const [recipient, conversation] = await Promise.all([User.findByPk(userId), Conversation.findByPk(conversationId)]);
  // The user's own switch (settings, /api/me/preferences); CHAT_UNREAD_EMAIL=0 is the global one.
  if (!recipient || recipient.suspendedAt || recipient.chatUnreadEmail === false) return;
  const otherId = conversation.teacherId === userId ? conversation.studentId : conversation.teacherId;
  const other = await User.findByPk(otherId, { attributes: ['name'] });
  if (ctx.stillOwned && !(await ctx.stillOwned())) return;
  await sendMail({
    to: recipient.email,
    ...chatUnread({ recipientName: recipient.name, senderName: other && other.name, count: pending.length, conversationId, locale: recipient.locale })
  });
  await sequelize.query(
    'UPDATE conversation_participants SET emailNotifiedSeq = GREATEST(emailNotifiedSeq, ?) WHERE id = ?',
    { replacements: [pending[0].seq, participant.id] }
  );
}

outbox.register(EMAIL_TOPIC, sendUnreadEmail);

module.exports = {
  ChatError, currentRules, listAvailableTeachers, startConversation, listConversations, unreadSummary, getConversation,
  listMessages, sendMessage, appendSystemMessage, markRead, setBlocked, report, listReports, readReportedMessages, hideMessage,
  sendUnreadEmail, EMAIL_TOPIC
};
