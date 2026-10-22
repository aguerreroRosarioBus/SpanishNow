// Ciclo W06; recibe la raíz para compartir autorización y orden de locks sin duplicarlos.
const { Op } = require('sequelize');
const M = require('../models');
const time = require('../domain/classTime');
const credits = require('./classCredits');
const outbox = require('./outbox');
const features = require('../config/features');

module.exports = core => {
  const { fail, invalid, locked, teacherOnly, version, zoneConfirmed, purchasesFor, conflicts, proposal, notify, audit, scheduleOf } = core._internal;
  const reason = value => {
    if (typeof value !== 'string' || value.trim().length < 3 || value.length > 500) invalid(['reason']);
    return value.trim();
  };
  async function policy(seats, transaction) {
    const seat = seats.find(s => s.purchaseId);
    const purchase = seat && await M.ClassPackagePurchase.findByPk(seat.purchaseId, { transaction });
    const parent = seats[0] && await M.ClassSession.findByPk(seats[0].sessionId, { transaction });
    const cohort = !purchase && parent?.cohortId ? await M.ClassCohort.findByPk(parent.cohortId, { transaction }) : null;
    const terms = cohort && await M.ClassPackageTemplateVersion.findByPk(cohort.templateVersionId, { transaction });
    const p = await M.ClassPolicyVersion.findByPk(purchase?.policyVersionId || terms?.policyVersionId || 0, { transaction });
    if (!p) fail('group_incomplete');
    return p.rules;
  }
  async function purchaseLocks(seats, transaction) {
    const ids = [...new Set(seats.filter(s => s.purchaseId).map(s => s.purchaseId))].sort((a, b) => a - b);
    for (const purchaseId of ids) await M.ClassPackagePurchase.findByPk(purchaseId, { transaction, lock: transaction.LOCK.UPDATE });
    return ids;
  }
  async function move(session, purchaseId, operation, actorId, transaction, why) {
    const key = operation === 'release' ? `release:session:${session.id}:purchase:${purchaseId}:v${session.version}`
      : `${operation}:session:${session.id}:purchase:${purchaseId}`;
    return credits.apply({ purchaseId, operation, units: 1, operationKey: key, classSessionId: session.id, actorId, reason: why }, { transaction });
  }
  async function reminders(session, seats, rules, transaction, now) {
    await outbox.cancel({ aggregateType: 'class_sessions', aggregateId: session.id, topicPrefix: 'reminder.', beforeVersion: session.version }, { transaction });
    if (session.status !== 'confirmed') return;
    for (const userId of [session.teacherId, ...seats.filter(s => s.status !== 'cancelled').map(s => s.userId)]) {
      for (const minutes of rules.remindersBeforeStartMinutes) {
        const runAt = new Date(time.addElapsed(session.startsAt.toISOString(), { minutes: -minutes }));
        if (runAt <= now) continue;
        await outbox.enqueue({ topic: 'reminder.session', aggregateType: 'class_sessions', aggregateId: session.id, aggregateVersion: session.version,
          dedupeKey: `reminder:${session.id}:v${session.version}:${userId}:${minutes}`, payload: { userId, minutes }, runAt }, { transaction });
      }
    }
  }
  async function syncIntents(session, transaction) {
    for (const provider of ['google_calendar', 'zoom']) {
      const connection = await M.ExternalConnection.findOne({ where: { userId: session.teacherId, provider, status: 'connected' }, transaction });
      const enabled = features.isEnabled(provider);
      const [ref] = await M.ExternalSyncRef.findOrCreate({ where: { sessionId: session.id, provider },
        defaults: { correlationKey: `${provider}:session:${session.id}`, status: 'needs_attention' }, transaction });
      await ref.update({ status: enabled && connection ? 'pending' : 'needs_attention',
        lastError: enabled && connection ? null : 'integration_not_connected' }, { transaction });
      // Los handlers y adaptadores son de W07/W08; nunca se inventa éxito de sync.
      if (enabled && connection) await outbox.enqueue({ topic: provider === 'google_calendar' ? 'calendar.sync' : 'zoom.sync',
        aggregateType: 'class_sessions', aggregateId: session.id, aggregateVersion: session.version,
        dedupeKey: `${provider}.sync:${session.id}:v${session.version}` }, { transaction });
    }
  }
  async function pending(session, wanted, transaction, now) {
    const p = await M.ClassSessionProposal.findOne({ where: { sessionId: session.id, version: wanted }, transaction });
    if (!p || p.version !== session.version || p.status !== 'pending' || p.expiresAt <= now) fail('proposal_stale');
    return p;
  }

  async function accept(user, sessionId, wanted, body = {}, { now = new Date() } = {}) {
    core._internal.id(wanted);
    return locked(user, sessionId, async ({ session, seats, settings, transaction }) => {
      const me = seats.find(s => s.userId === user.id && s.status !== 'cancelled');
      if (!me) fail('forbidden', {}, 403);
      const p = await M.ClassSessionProposal.findOne({ where: { sessionId: session.id, version: wanted }, transaction });
      if (p?.status === 'accepted') {
        const replacement = await M.AuditLog.findOne({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.replaced' }, transaction });
        if (replacement?.data?.proposalVersion === wanted && me.acceptedVersion === wanted) return core.detail(user, replacement.data.replacementSessionId, transaction);
      }
      if (p?.status === 'accepted' && session.version === wanted && me.acceptedVersion === wanted) return core.detail(user, session.id, transaction);
      await pending(session, wanted, transaction, now);
      await zoneConfirmed(user.id, transaction);
      const desired = scheduleOf(p);
      const acquired = await purchasesFor(session, seats, desired, transaction);
      const termsRows = await M.AuditLog.findAll({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.reschedule_terms' }, transaction });
      const terms = termsRows.find(r => r.data?.version === wanted)?.data;
      if (terms?.late && body.acknowledgeCharge !== true) invalid(['acknowledgeCharge']);
      await conflicts(session, seats, desired, settings, now, transaction);
      // Hasta W07 no se confirma a ciegas con una conexión externa que exigiría free/busy.
      if (await M.ExternalConnection.count({ where: { userId: session.teacherId, provider: 'google_calendar', status: 'connected' }, transaction })) {
        fail('provider_unavailable', { reason: 'availability_check_required' }, 503);
      }
      if (me.acceptedVersion !== wanted) {
        await me.update({ acceptedVersion: wanted, acceptedAt: now, ...(session.status === 'confirmed' ? {} : { status: 'accepted' }) }, { transaction });
        await audit(session, user.id, 'accepted', { version: wanted, acknowledgeCharge: body.acknowledgeCharge === true }, transaction);
      }
      if (seats.every(s => s.acceptedVersion === wanted)) {
        if (terms?.late) {
          const chargedPurchase = seats.find(s => s.userId === terms.requestedByStudentId)?.purchaseId;
          for (const purchase of acquired.purchases) {
            if (purchase.unitsAvailable + (purchase.id === chargedPurchase ? 0 : 1) < 1) fail('insufficient_credit', { available: purchase.unitsAvailable });
          }
          for (const purchase of acquired.purchases) await move(session, purchase.id, purchase.id === chargedPurchase ? 'consume' : 'release', user.id, transaction, 'Reprogramación tardía aceptada');
          const next = await M.ClassSession.create({ ...desired, teacherId: session.teacherId, kind: session.kind, cohortId: session.cohortId,
            liveClassId: session.liveClassId, status: 'confirmed', version: 1, confirmedAt: now }, { transaction });
          const nextSeats = await M.ClassSessionParticipant.bulkCreate(seats.map(s => ({ sessionId: next.id, userId: s.userId,
            purchaseId: s.purchaseId, status: 'confirmed', acceptedVersion: 1, acceptedAt: now })), { transaction });
          await M.ClassSessionProposal.create({ ...desired, sessionId: next.id, version: 1, kind: 'initial', status: 'accepted',
            proposedById: session.teacherId, expiresAt: p.expiresAt, resolvedAt: now }, { transaction });
          for (const purchase of acquired.purchases) await move(next, purchase.id, 'reserve', user.id, transaction);
          await p.update({ status: 'accepted', resolvedAt: now }, { transaction });
          await session.update({ status: 'cancelled', version: session.version + 1, cancelledAt: now, cancelledById: terms.requestedByStudentId,
            cancelReason: 'Reprogramación tardía aceptada' }, { transaction });
          await reminders(session, seats, acquired.rules, transaction, now);
          await reminders(next, nextSeats, acquired.rules, transaction, now);
          await syncIntents(session, transaction); await syncIntents(next, transaction);
          await audit(session, user.id, 'replaced', { proposalVersion: wanted, replacementSessionId: next.id }, transaction);
          await audit(next, user.id, 'confirmed', { replacesSessionId: session.id }, transaction);
          await notify(next, nextSeats, 'session_confirmed', 1, transaction);
          return core.detail(user, next.id, transaction);
        }
        if (p.kind === 'initial') {
          for (const purchase of acquired.purchases) await move(session, purchase.id, 'reserve', user.id, transaction);
        }
        for (const seat of seats) await seat.update({ status: 'confirmed', purchaseId: acquired.resolved.find(r => r.userId === seat.userId).purchaseId }, { transaction });
        await p.update({ status: 'accepted', resolvedAt: now }, { transaction });
        await session.update({ ...desired, status: 'confirmed', confirmedAt: session.confirmedAt || now }, { transaction });
        if (acquired.cohort) await acquired.cohort.update({ status: 'ready' }, { transaction });
        await reminders(session, seats, acquired.rules, transaction, now);
        await syncIntents(session, transaction);
        await notify(session, seats, p.kind === 'initial' ? 'session_confirmed' : 'session_rescheduled', wanted, transaction);
        await audit(session, user.id, p.kind === 'initial' ? 'confirmed' : 'rescheduled', { version: wanted }, transaction);
      }
      return core.detail(user, session.id, transaction);
    });
  }

  async function decline(user, sessionId, wanted, body = {}, { now = new Date() } = {}) {
    core._internal.id(wanted);
    return locked(user, sessionId, async ({ session, seats, transaction }) => {
      const me = seats.find(s => s.userId === user.id && s.status !== 'cancelled');
      if (!me) fail('forbidden', {}, 403);
      const p = await M.ClassSessionProposal.findOne({ where: { sessionId: session.id, version: wanted }, transaction });
      if (p?.status === 'declined' && session.version === wanted) return core.detail(user, session.id, transaction);
      await pending(session, wanted, transaction, now);
      await p.update({ status: 'declined', resolvedAt: now }, { transaction });
      if (p.kind === 'initial') {
        await me.update({ status: 'declined' }, { transaction });
        await session.update({ status: 'declined' }, { transaction });
      }
      await notify(session, seats, 'session_declined', wanted, transaction);
      await audit(session, user.id, 'declined', { version: wanted }, transaction);
      return core.detail(user, session.id, transaction);
    });
  }

  async function reschedule(user, sessionId, body, { now = new Date() } = {}) {
    return locked(user, sessionId, async ({ session, seats, settings, transaction }) => {
      teacherOnly(user, session); version(session, body?.version);
      if (session.status !== 'confirmed' || session.startsAt <= now) fail('proposal_stale');
      await zoneConfirmed(user.id, transaction);
      const desired = core._internal.normalizeRequest(body);
      const rules = await policy(seats, transaction);
      const late = body.requestedByStudentId && !time.isAtLeastHoursBefore(session.startsAt.toISOString(), now.toISOString(), rules.freeCancelHours);
      if (body.requestedByStudentId && !seats.some(s => s.userId === body.requestedByStudentId)) invalid(['requestedByStudentId']);
      if (body.chargeWaivedReason) await audit(session, user.id, 'charge_waived', { requestedByStudentId: body.requestedByStudentId }, transaction, reason(body.chargeWaivedReason));
      await proposal(session, seats, desired, body, settings, transaction, now, false);
      await audit(session, user.id, 'reschedule_terms', { version: session.version, late: Boolean(late && !body.chargeWaivedReason), requestedByStudentId: body.requestedByStudentId || null }, transaction);
      // La versión cambió pero el horario original sigue vigente y debe conservar avisos.
      await reminders(session, seats, rules, transaction, now);
      return core.detail(user, session.id, transaction);
    });
  }

  async function cancel(user, sessionId, body, { now = new Date() } = {}) {
    return locked(user, sessionId, async ({ session, seats, transaction }) => {
      version(session, body?.version);
      if (!['forming', 'proposed', 'confirmed'].includes(session.status)) fail('proposal_stale');
      const why = reason(body.reason);
      const isTeacher = session.teacherId === user.id;
      const me = seats.find(s => s.userId === user.id && s.status !== 'cancelled');
      if (!isTeacher && !me) fail('forbidden', {}, 403);
      const rules = await policy(seats, transaction);
      const ids = await purchaseLocks(seats, transaction);
      if (body.keepGroup) {
        teacherOnly(user, session);
        if (session.kind !== 'group' || session.status !== 'confirmed' || !seats.some(s => s.status === 'cancelled')) invalid(['keepGroup']);
        await session.update({ version: session.version + 1 }, { transaction });
        await audit(session, user.id, 'group_continue', { version: session.version }, transaction, why);
        await reminders(session, seats, rules, transaction, now);
        return core.detail(user, session.id, transaction);
      }
      if (body.chargeWaivedReason && !isTeacher) fail('forbidden', {}, 403);
      const waived = body.chargeWaivedReason ? reason(body.chargeWaivedReason) : null;
      if (body.requestedByStudentId && (!isTeacher || !seats.some(s => s.userId === body.requestedByStudentId))) invalid(['requestedByStudentId']);
      const requestedByStudent = !isTeacher || Boolean(body.requestedByStudentId);
      const late = requestedByStudent && !time.isAtLeastHoursBefore(session.startsAt.toISOString(), now.toISOString(), rules.freeCancelHours);
      const group3 = session.kind === 'group' && seats.length === 3;
      const requestedSeat = body.requestedByStudentId ? seats.find(s => s.userId === body.requestedByStudentId) : me;
      const targets = !requestedByStudent || !group3 ? seats.filter(s => s.status !== 'cancelled' && s.attendance === 'pending') : [requestedSeat];
      if (targets.some(s => !s || s.status === 'cancelled' || s.attendance !== 'pending') || !targets.length) fail('proposal_stale');
      const targetPurchases = [...new Set(targets.map(s => s.purchaseId).filter(Boolean))];
      if (session.status === 'confirmed') {
        for (const purchaseId of ids.filter(p => targetPurchases.includes(p))) {
          const attended = seats.some(s => s.purchaseId === purchaseId && ['attended', 'student_no_show'].includes(s.attendance));
          await move(session, purchaseId, attended || (late && !waived) ? 'consume' : 'release', user.id, transaction, why);
        }
      }
      for (const seat of targets) await seat.update({ status: 'cancelled' }, { transaction });
      await session.update({ version: session.version + 1, ...(seats.every(s => s.status === 'cancelled') ? {
        status: 'cancelled', cancelledAt: now, cancelledById: user.id, cancelReason: why, chargeWaivedReason: waived
      } : {}) }, { transaction });
      await M.ClassSessionProposal.update({ status: 'withdrawn', resolvedAt: now }, { where: { sessionId: session.id, status: 'pending' }, transaction });
      await reminders(session, seats, rules, transaction, now);
      await syncIntents(session, transaction);
      await notify(session, seats, 'session_cancelled', session.version, transaction);
      await audit(session, user.id, 'cancelled', { version: session.version, charge: late && !waived ? 'consumed' : 'none', userIds: targets.map(s => s.userId) }, transaction, why);
      if (waived) await audit(session, user.id, 'charge_waived', { version: session.version }, transaction, waived);
      return { ...(await core.detail(user, session.id, transaction)), charge: late && !waived ? 'consumed' : 'none' };
    });
  }

  async function attendance(user, sessionId, body, { now = new Date() } = {}) {
    return locked(user, sessionId, async ({ session, seats, transaction }) => {
      teacherOnly(user, session); version(session, body?.version);
      if (session.status !== 'confirmed') fail('proposal_stale');
      const current = await core.detail(user, session.id, transaction);
      if (current.groupResolutionRequired) fail('group_incomplete', { reason: 'teacher_decision_required' });
      const rules = await policy(seats, transaction);
      await purchaseLocks(seats, transaction);
      const seat = seats.find(s => s.userId === body.userId && s.status !== 'cancelled');
      if (!seat || !['attended', 'student_no_show', 'teacher_no_show', 'excused'].includes(body.attendance)) invalid(['attendance', 'userId']);
      if (seat.attendance !== 'pending') fail('version_conflict');
      if (body.attendance === 'attended' ? session.endsAt > now : new Date(time.addElapsed(session.startsAt.toISOString(), { minutes: rules.arrivalToleranceMinutes })) > now) fail('lead_time_too_short', {}, 400);
      const why = reason(body.reason);
      await seat.update({ attendance: body.attendance, attendanceMarkedAt: now, attendanceMarkedById: user.id }, { transaction });
      const samePurchase = seats.filter(s => s.purchaseId === seat.purchaseId && s.status !== 'cancelled');
      if (samePurchase.every(s => s.attendance !== 'pending')) {
        const billed = samePurchase.some(s => ['attended', 'student_no_show'].includes(s.attendance));
        await move(session, seat.purchaseId, billed ? 'consume' : 'release', user.id, transaction, why);
      }
      const allDone = seats.filter(s => s.status !== 'cancelled').every(s => s.attendance !== 'pending');
      const allTeacherAbsent = seats.filter(s => s.status !== 'cancelled').every(s => s.attendance === 'teacher_no_show');
      await session.update({ version: session.version + 1, ...(allDone ? { status: allTeacherAbsent ? 'teacher_no_show' : 'completed' } : {}) }, { transaction });
      await reminders(session, seats, rules, transaction, now);
      await audit(session, user.id, 'attendance', { version: session.version, userId: seat.userId, attendance: seat.attendance }, transaction, why);
      return core.detail(user, session.id, transaction);
    });
  }

  // Recordatorio durable dentro de la app. El recibo es idempotente y se guarda
  // con el agregado bajo el mismo lock que cancelaciones/reprogramaciones.
  outbox.register('reminder.session', async job => {
    if (!await M.ClassSession.count({ where: { id: job.aggregateId } })) return;
    await locked(null, job.aggregateId, async ({ session, seats, transaction }) => {
      if (session.status !== 'confirmed' || session.version !== job.aggregateVersion || session.startsAt <= new Date()) return;
      const userId = job.payload?.userId;
      if (userId !== session.teacherId && !seats.some(s => s.userId === userId && s.status !== 'cancelled')) return;
      const recipient = await M.User.findByPk(userId, { transaction });
      if (!recipient || recipient.suspendedAt) return;
      const previous = await M.AuditLog.findOne({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.reminder', actorId: userId }, transaction });
      const receipts = await M.AuditLog.findAll({ where: { entityType: 'class_sessions', entityId: session.id, action: 'session.reminder', actorId: userId }, transaction });
      if (previous && receipts.some(r => r.data?.dedupeKey === job.dedupeKey)) return;
      await audit(session, userId, 'reminder', { dedupeKey: job.dedupeKey, version: session.version, startsAt: session.startsAt.toISOString(),
        timeZone: recipient.timeZone, minutes: job.payload.minutes }, transaction);
    });
  });
  return { accept, decline, reschedule, cancel, attendance };
};
