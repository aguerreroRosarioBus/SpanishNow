// Agenda W06. Toda mutación bloquea docente → sesión → alumnos ordenados → compras ordenadas.
// Nunca llama proveedores dentro de la transacción; el saldo solo pasa por classCredits.
const { Op, Transaction } = require('sequelize');
const { createHash } = require('node:crypto');
const sequelize = require('../config/database');
const M = require('../models');
const time = require('../domain/classTime');
const credits = require('./classCredits');
const outbox = require('./outbox');
const chat = require('./chatService');
const { validatePolicy } = require('../domain/classPolicy');

class ScheduleError extends Error {
  constructor(statusCode, code, params = {}) {
    super(`Agenda: ${code}`); this.statusCode = statusCode; this.code = code; this.params = params;
  }
}
const fail = (code, params = {}, status = 409) => { throw new ScheduleError(status, code, params); };
const invalid = fields => fail('validation_failed', { fields }, 400);
const id = value => { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) invalid(['id']); return n; };
const uniqueIds = values => [...new Set(values)].sort((a, b) => a - b);
const temporalFields = ['localStart', 'timeZone', 'utcOffset', 'disambiguation', 'startsAt', 'endsAt', 'minutes'];
const scheduleOf = value => Object.fromEntries(temporalFields.map(key => [key, value[key] instanceof Date ? value[key].toISOString() : value[key]]));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const asDate = iso => new Date(time.normalizeInstant(iso));
const nowIso = now => now.toISOString();
const active = ['forming', 'proposed', 'confirmed'];

async function tx(fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, fn); }
    catch (error) {
      if (attempt >= 2 || !['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.parent?.code)) throw error;
    }
  }
}
async function audit(session, actorId, action, data, transaction, reason = null) {
  return M.AuditLog.create({ actorId, action: `session.${action}`, entityType: 'class_sessions', entityId: session.id, data, reason }, { transaction });
}
async function zoneConfirmed(userId, transaction) {
  const user = await M.User.findByPk(userId, { transaction, lock: transaction.LOCK.SHARE });
  if (!user || user.suspendedAt) fail('not_found', {}, 404);
  if (!user.timeZoneConfirmedAt || !time.isTimeZone(user.timeZone)) fail('time_zone_invalid', { reason: 'confirmation_required' }, 400);
  return user;
}
async function teacherLock(teacherId, transaction, enabled = false) {
  const settings = await M.TeacherClassSettings.findByPk(teacherId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!settings) fail('teacher_unavailable');
  if (enabled && !settings.classesEnabledAt) fail('teacher_unavailable');
  return settings;
}
async function usersLock(userIds, transaction, requireActive = false) {
  for (const userId of uniqueIds(userIds)) {
    const user = await M.User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || user.role !== 'student' || (requireActive && user.suspendedAt)) fail('not_found', {}, 404);
  }
}
async function load(user, sessionId, transaction = undefined) {
  const session = await M.ClassSession.findByPk(id(sessionId), { transaction });
  if (!session) fail('not_found', {}, 404);
  const seats = await M.ClassSessionParticipant.findAll({ where: { sessionId: session.id }, order: [['userId', 'ASC']], transaction });
  if (user && session.teacherId !== user.id && !seats.some(p => p.userId === user.id)) fail('not_found', {}, 404);
  return { session, seats };
}
async function locked(user, sessionId, fn) {
  const visible = await load(user, sessionId);
  return tx(async transaction => {
    const settings = await teacherLock(visible.session.teacherId, transaction);
    const session = await M.ClassSession.findByPk(visible.session.id, { transaction, lock: transaction.LOCK.UPDATE });
    const seats = await M.ClassSessionParticipant.findAll({ where: { sessionId: session.id }, order: [['userId', 'ASC']], transaction });
    if (user && session.teacherId !== user.id && !seats.some(p => p.userId === user.id)) fail('not_found', {}, 404);
    await usersLock(seats.map(p => p.userId), transaction);
    return fn({ session, seats, settings, transaction });
  });
}
function teacherOnly(user, session) { if (user.id !== session.teacherId || user.role !== 'teacher') fail('forbidden', {}, 403); }
function version(session, value) { if (value !== session.version) fail('version_conflict', { version: session.version }); }

// No expone órdenes, importes, emails o mensajes de otros participantes.
async function detail(user, sessionId, transaction) {
  const { session, seats } = await load(user, sessionId, transaction);
  const people = await M.User.findAll({ where: { id: [session.teacherId, ...seats.map(p => p.userId)] }, attributes: ['id', 'name', 'timeZone'], transaction });
  const person = userId => people.find(p => p.id === userId);
  const proposals = await M.ClassSessionProposal.findAll({ where: { sessionId: session.id }, order: [['version', 'DESC']], transaction });
  const refs = await M.ExternalSyncRef.findAll({ where: { sessionId: session.id }, attributes: ['provider', 'status', 'syncedVersion'], transaction });
  const purchased = seats.find(s => s.purchaseId);
  const purchase = purchased && await M.ClassPackagePurchase.findByPk(purchased.purchaseId, { transaction });
  const policy = purchase && await M.ClassPolicyVersion.findByPk(purchase.policyVersionId, { transaction });
  const decisions = await M.AuditLog.findAll({ where: { entityType: 'class_sessions', entityId: session.id, action: ['session.cancelled', 'session.group_continue'] }, order: [['id', 'DESC']], transaction });
  const groupResolutionRequired = active.includes(session.status) && seats.length === 3 && seats.some(s => s.status === 'cancelled') && decisions[0]?.action !== 'session.group_continue';
  const terms = await M.AuditLog.findAll({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.reschedule_terms' }, order: [['id', 'DESC']], transaction });
  const replacement = await M.AuditLog.findOne({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.replaced' }, transaction });
  const currentProposal = proposals.find(p => p.status === 'pending') || proposals[0];
  const proposalTerms = terms.find(t => t.data?.version === currentProposal?.version)?.data;
  let timeZoneRulesChanged = false;
  try {
    const expected = time.resolveLocalIntent({ localStart: session.localStart, timeZone: session.timeZone, offset: session.utcOffset,
      disambiguation: session.disambiguation, minutes: session.minutes });
    timeZoneRulesChanged = expected.startsAt !== session.startsAt.toISOString() || expected.endsAt !== session.endsAt.toISOString();
  } catch { timeZoneRulesChanged = true; }
  const visiblePurchaseIds = uniqueIds(seats.filter(s => s.purchaseId && (user?.id === session.teacherId || user?.id === s.userId)).map(s => s.purchaseId));
  const visiblePurchases = await M.ClassPackagePurchase.findAll({ where: { id: visiblePurchaseIds }, attributes: ['id', 'expiresAt', 'unitsAvailable', 'unitsReserved', 'unitsConsumed'], transaction });
  const extensionRequests = await M.AuditLog.findAll({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.extension_requested' }, order: [['id', 'DESC']], transaction });
  const eligible = purchaseId => seats.some(s => s.purchaseId === purchaseId && s.attendance === 'teacher_no_show')
    || decisions.some(a => a.action === 'session.cancelled' && a.data?.teacherInitiated && seats.some(s => s.purchaseId === purchaseId && a.data.userIds?.includes(s.userId)));
  const board = session.liveClassId && session.status === 'confirmed' && seats.some(s => s.userId === user?.id && s.status !== 'cancelled')
    ? await M.LiveClass.findOne({ where: { id: session.liveClassId, teacherId: session.teacherId, courseId: null }, attributes: ['joinCode'], transaction }) : null;
  return {
    ...session.toJSON(), teacher: person(session.teacherId),
    participants: seats.map(p => ({ userId: p.userId, name: person(p.userId)?.name, status: p.status, acceptedVersion: p.acceptedVersion,
      attendance: p.attendance, purchaseId: user?.id === session.teacherId || user?.id === p.userId ? p.purchaseId : undefined })),
    proposal: currentProposal ? { ...currentProposal.toJSON(), charge: proposalTerms?.late ? 'consumed_and_new_credit' : 'none' } : null,
    replacementSessionId: replacement?.data?.replacementSessionId || null,
    proposals, purchases: visiblePurchases.map(p => ({ ...p.toJSON(), extensionEligible: eligible(p.id) })),
    extensionRequests: extensionRequests.filter(a => visiblePurchaseIds.includes(a.data?.purchaseId) && (user?.id === session.teacherId || user?.id === a.actorId))
      .map(a => ({ userId: a.actorId, purchaseId: a.data.purchaseId, unavailableMinutes: a.data.unavailableMinutes })), whiteboardJoinCode: board?.joinCode || null,
    sync: refs, rules: policy?.rules || null, groupResolutionRequired, timeZoneRulesChanged, serverNow: new Date().toISOString()
  };
}

async function cohortFor(cohortId, teacherId, userIds, transaction, allowReduced = false) {
  if (!cohortId) return null;
  const cohort = await M.ClassCohort.findByPk(id(cohortId), { transaction });
  if (!cohort || cohort.teacherId !== teacherId) fail('not_found', {}, 404);
  const members = await M.ClassCohortMember.findAll({ where: { cohortId: cohort.id, status: 'accepted' }, transaction });
  if (!['forming', 'ready'].includes(cohort.status) || !userIds.length
    || (!allowReduced && (cohort.groupSize !== userIds.length || members.length !== userIds.length))
    || !userIds.every(userId => members.some(m => m.userId === userId))) fail('group_incomplete');
  return cohort;
}

/** Valida datos adquiridos, nunca toma condiciones/precio del cliente. No mueve saldo. */
async function purchasesFor(session, seats, schedule, transaction, { requireAll = true } = {}) {
  const userIds = seats.map(p => p.userId);
  if (await M.User.count({ where: { id: userIds, suspendedAt: null }, transaction }) !== userIds.length) fail('not_found', {}, 404);
  const decisions = session.id ? await M.AuditLog.findAll({ where: { entityType: 'class_sessions', entityId: session.id, action: ['session.cancelled', 'session.group_continue'] }, order: [['id', 'DESC']], transaction }) : [];
  const allowReduced = decisions[0]?.action === 'session.group_continue';
  const cohort = await cohortFor(session.cohortId, session.teacherId, userIds, transaction, allowReduced);
  let candidates = [];
  if (cohort && seats.some(p => !p.purchaseId)) {
    candidates = await M.ClassPackagePurchase.findAll({ where: { teacherId: session.teacherId, cohortId: cohort.id, status: 'active' }, transaction });
  }
  const beneficiaries = await M.ClassPackageBeneficiary.findAll({
    where: { purchaseId: uniqueIds([...seats.filter(p => p.purchaseId).map(p => p.purchaseId), ...candidates.map(p => p.id)]) }, transaction
  });
  const resolved = seats.map(p => ({ userId: p.userId, purchaseId: p.purchaseId || candidates.find(c => beneficiaries.some(b => b.purchaseId === c.id && b.userId === p.userId))?.id || null }));
  const purchases = [];
  for (const purchaseId of uniqueIds(resolved.filter(p => p.purchaseId).map(p => p.purchaseId))) {
    const purchase = await M.ClassPackagePurchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!purchase || purchase.teacherId !== session.teacherId) fail('not_found', {}, 404);
    const covered = resolved.filter(p => p.purchaseId === purchase.id);
    if (!covered.every(p => beneficiaries.some(b => b.purchaseId === purchase.id && b.userId === p.userId))) fail('not_found', {}, 404);
    const terms = await M.ClassPackageTemplateVersion.findByPk(purchase.templateVersionId, { transaction });
    if (purchase.status !== 'active' || purchase.expiresAt <= new Date() || asDate(schedule.endsAt) > purchase.expiresAt) fail('package_not_active');
    if (purchase.minutesPerSession !== schedule.minutes || terms.modality !== session.kind || covered.length > purchase.seatsCovered
      || (cohort && (purchase.cohortId !== cohort.id || purchase.templateVersionId !== cohort.templateVersionId))
      || (terms.billing === 'per_group' && (covered.length !== 2 || userIds.length !== 2))
      || (terms.billing === 'per_seat' && covered.length !== 1)) invalid(['participants', 'minutes']);
    purchases.push(purchase);
  }
  if (requireAll && resolved.some(p => !p.purchaseId)) fail('group_incomplete');
  if (!cohort && (userIds.length !== 1 || purchases.length !== 1)) invalid(['participants']);
  const terms = cohort ? await M.ClassPackageTemplateVersion.findByPk(cohort.templateVersionId, { transaction }) : null;
  const policyId = purchases[0]?.policyVersionId || terms?.policyVersionId;
  const policy = policyId && await M.ClassPolicyVersion.findByPk(policyId, { transaction });
  if (!policy || validatePolicy(policy.rules).length) fail('validation_failed', { fields: ['policy'] }, 400);
  return { purchases, resolved, rules: policy.rules, cohort, complete: resolved.every(p => p.purchaseId) };
}

async function conflicts(session, seats, desired, settings, now, transaction) {
  const memberships = await M.ClassSessionParticipant.findAll({ where: { userId: seats.map(p => p.userId), status: { [Op.ne]: 'cancelled' } }, attributes: ['sessionId'], transaction });
  const sessions = await M.ClassSession.findAll({ where: {
    id: { [Op.ne]: session.id || 0 }, status: active,
    [Op.or]: [{ teacherId: session.teacherId }, { id: memberships.map(p => p.sessionId) }]
  }, transaction });
  const allSettings = await M.TeacherClassSettings.findAll({ where: { userId: uniqueIds(sessions.map(s => s.teacherId)) }, transaction });
  for (const other of sessions) {
    const buffer = Math.max(settings.sessionBufferMinutes, allSettings.find(s => s.userId === other.teacherId)?.sessionBufferMinutes || 0);
    if (other.status === 'confirmed' && time.intervalsConflict(desired, { startsAt: other.startsAt.toISOString(), endsAt: other.endsAt.toISOString() }, buffer)) fail('schedule_conflict');
    const holds = await M.ClassSessionProposal.findAll({ where: { sessionId: other.id, status: 'pending', expiresAt: { [Op.gt]: now } }, transaction });
    if (holds.some(p => time.intervalsConflict(desired, { startsAt: p.startsAt.toISOString(), endsAt: p.endsAt.toISOString() }, buffer))) fail('schedule_conflict');
  }
}

async function notify(session, seats, eventCode, proposalVersion, transaction) {
  for (const seat of seats) {
    const conversation = await M.Conversation.findOne({ where: { teacherId: session.teacherId, studentId: seat.userId }, transaction });
    if (!conversation) fail('not_found', {}, 404);
    await chat.appendSystemMessage(conversation.id, {
      type: eventCode === 'session_proposed' ? 'session_proposal' : 'system_event', eventCode,
      eventParams: { sessionId: session.id, version: proposalVersion }, classSessionId: session.id, proposalVersion,
      dedupeKey: `session:${session.id}:v${proposalVersion}:${eventCode}:${seat.userId}`
    }, { transaction });
  }
}
function normalizeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid(['body']);
  const extra = Object.keys(body).filter(k => !['intent', 'participants', 'cohortId', 'liveClassId', 'leadTimeException', 'reason', 'version', 'requestedByStudentId', 'chargeWaivedReason'].includes(k));
  if (extra.length) invalid(extra);
  const desired = { ...time.resolveLocalIntent(body.intent), minutes: body.intent.minutes };
  if (body.leadTimeException !== undefined && typeof body.leadTimeException !== 'boolean') invalid(['leadTimeException']);
  if (body.leadTimeException && !(typeof body.reason === 'string' && body.reason.trim().length >= 3 && body.reason.length <= 500)) invalid(['reason']);
  return desired;
}
async function proposal(session, seats, desired, body, settings, transaction, now, initial, first = initial, renewGroup = false) {
  const acquired = await purchasesFor(session, seats, desired, transaction, { requireAll: !session.cohortId });
  if (renewGroup && !acquired.complete) fail('group_incomplete');
  await conflicts(session, seats, desired, settings, now, transaction);
  const minHours = Math.max(acquired.rules.proposalLeadHours, settings.minLeadTimeHours);
  if (!time.isAtLeastHoursBefore(desired.startsAt, nowIso(now), minHours) && !body.leadTimeException) fail('lead_time_too_short', { hours: minHours }, 400);
  const expiry = Math.min(asDate(time.addElapsed(nowIso(now), { hours: acquired.rules.proposalTtlHours })).getTime(),
    asDate(time.addElapsed(desired.startsAt, { hours: -acquired.rules.proposalCutoffBeforeStartHours })).getTime(),
    initial && acquired.cohort?.status === 'forming' && !renewGroup ? acquired.cohort.formingDeadlineAt.getTime() : Infinity,
    // Una reprogramación no puede aceptarse cuando el horario confirmado original ya empezó.
    initial ? Infinity : session.startsAt.getTime());
  if (expiry <= now.getTime()) fail('proposal_stale');
  await M.ClassSessionProposal.update({ status: 'superseded', resolvedAt: now }, { where: { sessionId: session.id, status: 'pending' }, transaction });
  const nextVersion = first ? 1 : session.version + 1;
  await session.update({ version: nextVersion, ...(initial ? { ...desired, status: acquired.complete ? 'proposed' : 'forming' } : {}) }, { transaction });
  for (const seat of seats) {
    const resolved = acquired.resolved.find(p => p.userId === seat.userId);
    await seat.update({ purchaseId: resolved.purchaseId, acceptedVersion: null, acceptedAt: null, ...(initial ? { status: 'invited' } : {}) }, { transaction });
  }
  const result = await M.ClassSessionProposal.create({ ...desired, sessionId: session.id, version: nextVersion,
    kind: initial ? 'initial' : 'reschedule', proposedById: session.teacherId, expiresAt: new Date(expiry), leadTimeException: Boolean(body.leadTimeException) }, { transaction });
  await audit(session, session.teacherId, 'proposed', { version: nextVersion, leadTimeException: result.leadTimeException }, transaction, body.reason || null);
  await outbox.enqueue({ topic: 'proposal.expire', aggregateType: 'class_sessions', aggregateId: session.id, aggregateVersion: nextVersion,
    dedupeKey: `proposal.expire:${session.id}:v${nextVersion}`, runAt: result.expiresAt }, { transaction });
  await notify(session, seats, 'session_proposed', nextVersion, transaction);
  return acquired;
}

async function create(user, body, key, { now = new Date() } = {}) {
  if (user.role !== 'teacher') fail('forbidden', {}, 403);
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(key)) invalid(['Idempotency-Key']);
  const desired = normalizeRequest(body);
  if (!Array.isArray(body.participants) || !body.participants.length || body.participants.length > 3) invalid(['participants']);
  const seats = body.participants.map(p => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !['userId', 'purchaseId'].includes(k))) invalid(['participants']);
    return { userId: id(p.userId), purchaseId: p.purchaseId == null ? null : id(p.purchaseId) };
  });
  if (uniqueIds(seats.map(p => p.userId)).length !== seats.length) invalid(['participants']);
  seats.sort((a, b) => a.userId - b.userId);
  const requestHash = digest({ desired, seats, cohortId: body.cohortId || null, liveClassId: body.liveClassId || null, leadTimeException: Boolean(body.leadTimeException), reason: body.reason || null });
  return tx(async transaction => {
    const settings = await teacherLock(user.id, transaction, true);
    const existing = await M.ClassSession.findOne({ where: { teacherId: user.id, idempotencyKey: key }, transaction });
    if (existing) {
      const receipt = await M.AuditLog.findOne({ where: { entityType: 'class_sessions', entityId: existing.id, action: 'session.created' }, transaction });
      if (receipt?.data?.requestHash !== requestHash) fail('operation_key_conflict');
      return { session: await detail(user, existing.id, transaction), created: false };
    }
    await usersLock(seats.map(p => p.userId), transaction, true);
    await zoneConfirmed(user.id, transaction);
    const cohort = await cohortFor(body.cohortId, user.id, seats.map(s => s.userId), transaction);
    for (const seat of seats) {
      if (!await M.Conversation.count({ where: { teacherId: user.id, studentId: seat.userId }, transaction })) {
        if (!cohort) fail('not_found', {}, 404);
        const conversation = await M.Conversation.create({ teacherId: user.id, studentId: seat.userId, createdById: user.id }, { transaction });
        await M.ConversationParticipant.bulkCreate([{ conversationId: conversation.id, userId: user.id, role: 'teacher' },
          { conversationId: conversation.id, userId: seat.userId, role: 'student' }], { transaction });
      }
    }
    if (body.liveClassId && !await M.LiveClass.count({ where: { id: id(body.liveClassId), teacherId: user.id, courseId: null }, transaction })) fail('not_found', {}, 404);
    const session = await M.ClassSession.create({ ...desired, teacherId: user.id, kind: body.cohortId ? 'group' : 'individual',
      cohortId: body.cohortId || null, liveClassId: body.liveClassId || null, idempotencyKey: key }, { transaction });
    const models = await M.ClassSessionParticipant.bulkCreate(seats.map(p => ({ ...p, sessionId: session.id })), { transaction });
    await proposal(session, models, desired, body, settings, transaction, now, true);
    await audit(session, user.id, 'created', { requestHash }, transaction);
    return { session: await detail(user, session.id, transaction), created: true };
  });
}

async function list(user, query = {}) {
  const from = query.from ? asDate(query.from) : new Date(Date.now() - 7 * 86400e3);
  const to = query.to ? asDate(query.to) : new Date(Date.now() + 90 * 86400e3);
  if (to <= from || to - from > 366 * 86400e3) invalid(['from', 'to']);
  if (query.role && !['teacher', 'student'].includes(query.role)) invalid(['role']);
  const own = await M.ClassSessionParticipant.findAll({ where: { userId: user.id }, attributes: ['sessionId'] });
  const where = { startsAt: { [Op.gte]: from, [Op.lt]: to }, [Op.or]: [{ teacherId: user.id }, { id: own.map(p => p.sessionId) }] };
  if (query.role === 'teacher') where.teacherId = user.id;
  if (query.role === 'student') where.id = own.map(p => p.sessionId);
  const sessions = await M.ClassSession.findAll({ where, order: [['startsAt', 'ASC'], ['id', 'ASC']], limit: 200 });
  return { items: await Promise.all(sessions.map(s => detail(user, s.id))), truncated: sessions.length === 200 };
}

async function options(user, query = {}) {
  if (user.role !== 'teacher') fail('forbidden', {}, 403);
  const conversation = query.conversationId && await M.Conversation.findOne({ where: { id: id(query.conversationId), teacherId: user.id } });
  if (query.conversationId && !conversation) fail('not_found', {}, 404);
  const conversations = await M.Conversation.findAll({ where: { teacherId: user.id }, attributes: ['studentId'] });
  const purchases = await M.ClassPackagePurchase.findAll({ where: { teacherId: user.id }, order: [['paidAt', 'DESC']], limit: 500 });
  const beneficiaries = await M.ClassPackageBeneficiary.findAll({ where: { purchaseId: purchases.map(p => p.id) } });
  const cohorts = await M.ClassCohort.findAll({ where: { teacherId: user.id, status: ['forming', 'ready'] } });
  const members = await M.ClassCohortMember.findAll({ where: { cohortId: cohorts.map(c => c.id), status: 'accepted' } });
  const students = await M.User.findAll({ where: { id: uniqueIds([...conversations.map(c => c.studentId), ...members.map(m => m.userId)]), suspendedAt: null }, attributes: ['id', 'name'] });
  const cohortTerms = await M.ClassPackageTemplateVersion.findAll({ where: { id: cohorts.map(c => c.templateVersionId) }, attributes: ['id', 'minutesPerSession'] });
  const whiteboards = await M.LiveClass.findAll({ where: { teacherId: user.id, courseId: null, status: ['draft', 'live'] }, attributes: ['id', 'title'], limit: 100 });
  return { studentId: conversation?.studentId || null, students, whiteboards, purchases: purchases.map(p => ({ id: p.id, cohortId: p.cohortId,
    minutesPerSession: p.minutesPerSession, seatsCovered: p.seatsCovered, status: p.status, expiresAt: p.expiresAt,
    available: p.unitsAvailable, beneficiaryIds: beneficiaries.filter(b => b.purchaseId === p.id).map(b => b.userId) })),
    cohorts: cohorts.map(c => ({ id: c.id, groupSize: c.groupSize, minutesPerSession: cohortTerms.find(t => t.id === c.templateVersionId)?.minutesPerSession,
      formingDeadlineAt: c.formingDeadlineAt, memberIds: members.filter(m => m.cohortId === c.id).map(m => m.userId) })) };
}

async function remindersFeed(user) {
  const rows = await M.AuditLog.findAll({ where: { actorId: user.id, action: 'session.reminder', entityType: 'class_sessions' }, order: [['id', 'DESC']], limit: 100 });
  const items = [];
  for (const row of rows) {
    const session = await M.ClassSession.findByPk(row.entityId);
    if (session?.status !== 'confirmed' || session.version !== row.data?.version) continue;
    const me = user.id === session.teacherId || await M.ClassSessionParticipant.count({ where: { sessionId: session.id, userId: user.id, status: { [Op.ne]: 'cancelled' } } });
    if (me) items.push({ id: row.id, sessionId: session.id, ...row.data });
  }
  return { items };
}

async function join(user, sessionId) {
  const { session, seats } = await load(user, sessionId);
  if (session.status !== 'confirmed' || (session.teacherId !== user.id && !seats.some(s => s.userId === user.id && s.status !== 'cancelled'))) fail('proposal_stale');
  // El enlace de anfitrión se obtiene al momento en W08; no se usa joinUrl como sustituto.
  if (session.teacherId === user.id) fail('provider_unavailable', { reason: 'host_integration_pending' }, 503);
  const ref = await M.ExternalSyncRef.findOne({ where: { sessionId: session.id, provider: 'zoom' } });
  const link = ref?.manualJoinUrl || (ref?.status === 'ready' ? ref.joinUrl : null);
  if (!link) fail('integration_not_connected');
  let url;
  try { url = new URL(link); } catch { fail('provider_unavailable', {}, 503); }
  if (url.protocol !== 'https:' || (url.hostname !== 'zoom.us' && !url.hostname.endsWith('.zoom.us'))) fail('provider_unavailable', {}, 503);
  return { joinUrl: url.href, manual: Boolean(ref.manualJoinUrl) };
}

async function retrySync(user, sessionId) {
  const { hasPermission } = require('../config/permissions');
  const support = hasPermission(user, 'class_sessions.support');
  return locked(support ? null : user, sessionId, async ({ session, transaction }) => {
    if (user.id !== session.teacherId && !support) fail('forbidden', {}, 403);
    const refs = await M.ExternalSyncRef.findAll({ where: { sessionId: session.id }, transaction });
    if (!refs.length) fail('integration_not_connected');
    for (const ref of refs) {
      if (!await M.ExternalConnection.count({ where: { userId: session.teacherId, provider: ref.provider, status: 'connected' }, transaction })) fail('integration_not_connected');
      const topic = ref.provider === 'zoom' ? 'zoom.sync' : 'calendar.sync';
      await M.OutboxJob.update({ status: 'pending', attempts: 0, runAt: new Date(), lastError: null }, {
        where: { aggregateType: 'class_sessions', aggregateId: session.id, aggregateVersion: session.version, topic, status: 'failed' }, transaction });
    }
    await audit(session, user.id, 'sync_retry', { version: session.version }, transaction);
    return user.id === session.teacherId ? detail(user, session.id, transaction) : { id: session.id, sync: refs.map(r => ({ provider: r.provider, status: r.status, syncedVersion: r.syncedVersion })) };
  });
}

async function expire(sessionId, proposalVersion, { now = new Date() } = {}) {
  return locked(null, sessionId, async ({ session, seats, transaction }) => {
    const p = await M.ClassSessionProposal.findOne({ where: { sessionId: session.id, version: proposalVersion }, transaction });
    if (!p || p.status !== 'pending' || p.expiresAt > now) return;
    await p.update({ status: 'expired', resolvedAt: now }, { transaction });
    if (p.kind === 'initial') await session.update({ status: 'expired' }, { transaction });
    await notify(session, seats, 'session_expired', p.version, transaction);
    await audit(session, null, 'expired', { version: p.version }, transaction);
  });
}

outbox.register('proposal.expire', async job => {
  // Una limpieza de cuentas puede haber eliminado el agregado mientras el job esperaba.
  if (await M.ClassSession.count({ where: { id: job.aggregateId } })) await expire(job.aggregateId, job.aggregateVersion);
});

module.exports = { create, detail, list, options, remindersFeed, join, retrySync, expire, ScheduleError,
  _internal: { fail, invalid, id, tx, locked, teacherOnly, version, zoneConfirmed, purchasesFor, conflicts, proposal, notify, audit, scheduleOf, normalizeRequest, active } };
Object.assign(module.exports, require('./classSessionLifecycle')(module.exports));
