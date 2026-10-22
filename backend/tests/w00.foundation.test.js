// W00 invariants that hold without any real provider (docs/clases-chat-integraciones/CONTRATO.md):
// uniqueness in the database (CONTRACT-01), balance checks and the credit ledger (PACK-19, AC04), durable outbox
// (CONTRACT-03/04), UTC persistence (TZ-01), feature flags and capabilities (§16), test account cleanup (CONTRACT-05).
const { randomUUID } = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../src/config/database');
const {
  User, TeacherClassSettings, Conversation, ConversationParticipant, Message, ClassPolicyVersion, ClassPackageTemplate,
  ClassPackageTemplateVersion, ClassOffer, ClassOfferBeneficiary, ClassPackageOrder, PaymentProviderEvent, ClassPackagePurchase,
  ClassPackageBeneficiary, ClassCreditLedger, ClassSession, ClassSessionParticipant, ClassSessionProposal, ExternalSyncRef,
  OutboxJob, AuditLog
} = require('../src/models');
const credits = require('../src/services/classCredits');
const outbox = require('../src/services/outbox');
const features = require('../src/config/features');
const { PERMISSION_KEYS, effectivePermissions } = require('../src/config/permissions');
const { deleteTestUser } = require('../src/services/adminUsers');
const { DEFAULT_POLICY_V1 } = require('../src/domain/classPolicy');
const { as, createUser } = require('./helpers/fixtures');

const unique = () => randomUUID().replace(/-/g, '');
const errorName = promise => promise.then(() => 'ok', error => error.name);

let policy;
beforeAll(async () => {
  const [{ next }] = await sequelize.query('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM class_policy_versions', { type: QueryTypes.SELECT });
  policy = await ClassPolicyVersion.create({ version: next, rules: DEFAULT_POLICY_V1 });
});

async function makeUser(role, { test = false } = {}) {
  if (!test) return createUser(role, `w00-${role}`);
  return User.create({ name: `w00 ${role}`, email: `w00-${unique()}@spanishnow.test`, password: 'jest-password-1', role, isTestAccount: true });
}

/** Teacher, student, conversation, sent offer, paid order and a purchase with `units` granted through the ledger. */
async function packageChain({ units = 4, test = false, teacher, student } = {}) {
  teacher = teacher || await makeUser('teacher', { test });
  student = student || await makeUser('student', { test });
  await TeacherClassSettings.upsert({ userId: teacher.id, classesEnabledAt: new Date(), acceptsInquiries: true });
  const template = await ClassPackageTemplate.create({ teacherId: teacher.id, templateKey: `individual-${units}x50-${unique().slice(0, 8)}` });
  const version = await ClassPackageTemplateVersion.create({
    templateId: template.id, version: 1, nameEn: 'Pack', nameEs: 'Paquete', modality: 'individual', billing: 'per_buyer',
    sessionsCount: units, minutesPerSession: 50, priceAmount: 9000, currency: 'USD', validityHours: 2160, policyVersionId: policy.id,
    hotmartProductId: 'P123', hotmartOfferCode: 'off4x50'
  });
  await template.update({ currentVersionId: version.id });
  const [conversation] = await Conversation.findOrCreate({ where: { teacherId: teacher.id, studentId: student.id }, defaults: { createdById: student.id } });
  await ConversationParticipant.findOrCreate({ where: { conversationId: conversation.id, userId: teacher.id }, defaults: { role: 'teacher' } });
  await ConversationParticipant.findOrCreate({ where: { conversationId: conversation.id, userId: student.id }, defaults: { role: 'student' } });
  const offer = await ClassOffer.create({
    conversationId: conversation.id, teacherId: teacher.id, buyerId: student.id, templateVersionId: version.id, policyVersionId: policy.id,
    status: 'paid', snapshot: { priceAmount: 9000 }, amount: 9000, currency: 'USD', sessionsCount: units, minutesPerSession: 50,
    seatsCovered: 1, validityHours: 2160, sentAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 3600e3)
  });
  await ClassOfferBeneficiary.create({ offerId: offer.id, userId: student.id });
  const order = await ClassPackageOrder.create({
    offerId: offer.id, buyerId: student.id, amount: 9000, currency: 'USD', provider: 'fake', status: 'paid', checkoutRef: unique(), paidAt: new Date()
  });
  const purchase = await ClassPackagePurchase.create({
    orderId: order.id, offerId: offer.id, teacherId: teacher.id, buyerId: student.id, templateVersionId: version.id, policyVersionId: policy.id,
    snapshot: {}, minutesPerSession: 50, seatsCovered: 1, paidAt: new Date(), expiresAt: new Date(Date.now() + 2160 * 3600e3)
  });
  await ClassPackageBeneficiary.create({ purchaseId: purchase.id, userId: student.id });
  if (units) {
    await sequelize.transaction(transaction => credits.apply({ purchaseId: purchase.id, operation: 'grant', units, operationKey: `grant:order:${order.id}` }, { transaction }));
  }
  return { teacher, student, template, version, conversation, offer, order, purchase };
}

async function makeSession(teacher, student, purchase, startsAt = new Date('2027-01-10T15:00:00Z')) {
  const schedule = { startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60e3), timeZone: 'America/New_York', localStart: '2027-01-10T10:00', utcOffset: '-05:00', minutes: 50 };
  const session = await ClassSession.create({ teacherId: teacher.id, kind: 'individual', status: 'proposed', ...schedule });
  await ClassSessionProposal.create({ sessionId: session.id, version: 1, kind: 'initial', proposedById: teacher.id, expiresAt: new Date(Date.now() + 3600e3), ...schedule });
  await ClassSessionParticipant.create({ sessionId: session.id, userId: student.id, purchaseId: purchase.id });
  return session;
}

describe('CONTRACT-01: uniqueness enforced by the database', () => {
  let chain;
  beforeAll(async () => { chain = await packageChain(); });

  test('one conversation per teacher-student pair', async () => {
    expect(await errorName(Conversation.create({ teacherId: chain.teacher.id, studentId: chain.student.id }))).toBe('SequelizeUniqueConstraintError');
  });

  test('one message per clientMessageId and sender; server sequence unique per conversation', async () => {
    const base = { conversationId: chain.conversation.id, senderId: chain.student.id, type: 'text', body: 'Hola' };
    await Message.create({ ...base, seq: 1, clientMessageId: 'c-1' });
    expect(await errorName(Message.create({ ...base, seq: 2, clientMessageId: 'c-1' }))).toBe('SequelizeUniqueConstraintError');
    expect(await errorName(Message.create({ ...base, seq: 1, clientMessageId: 'c-2' }))).toBe('SequelizeUniqueConstraintError');
    // System messages have no sender: several of them never collide.
    await Message.create({ conversationId: chain.conversation.id, seq: 3, type: 'system_event', eventCode: 'offer_paid' });
    await Message.create({ conversationId: chain.conversation.id, seq: 4, type: 'system_event', eventCode: 'offer_paid' });
  });

  test('a single pending checkout per offer, enforced by MySQL from status and offerId (nothing to fill in)', async () => {
    const offer = (await packageChain({ units: 0 })).offer;
    const order = { offerId: offer.id, buyerId: offer.buyerId, amount: 9000, currency: 'USD', provider: 'fake' };
    const first = await ClassPackageOrder.create({ ...order, checkoutRef: unique() });
    expect(await errorName(ClassPackageOrder.create({ ...order, checkoutRef: unique() }))).toBe('SequelizeUniqueConstraintError');
    // Raw SQL cannot sidestep it either: the column is generated.
    await expect(sequelize.query(
      "INSERT INTO class_package_orders (offerId, buyerId, amount, currency, provider, status, checkoutRef, pendingOfferId, refundedAmount, createdAt, updatedAt) VALUES (?, ?, 9000, 'USD', 'fake', 'pending', ?, NULL, 0, NOW(), NOW())",
      { replacements: [offer.id, offer.buyerId, unique()] }
    )).rejects.toThrow(/generated column/i);
    // Settling the pending attempt frees the slot; settled attempts never collide.
    await first.update({ status: 'failed' });
    await ClassPackageOrder.create({ ...order, checkoutRef: unique(), status: 'failed' });
    await ClassPackageOrder.create({ ...order, checkoutRef: unique() });
    const [{ pending }] = await sequelize.query('SELECT COUNT(*) AS pending FROM class_package_orders WHERE pendingOfferId = ?', { replacements: [offer.id], type: QueryTypes.SELECT });
    expect(Number(pending)).toBe(1);
  });

  test('provider transactions and events are processed once', async () => {
    const order = { offerId: chain.offer.id, buyerId: chain.student.id, amount: 9000, currency: 'USD', provider: 'hotmart', status: 'failed' };
    const tx = `HP${unique().slice(0, 12)}`;
    await ClassPackageOrder.create({ ...order, checkoutRef: unique(), providerTransactionId: tx });
    expect(await errorName(ClassPackageOrder.create({ ...order, checkoutRef: unique(), providerTransactionId: tx }))).toBe('SequelizeUniqueConstraintError');
    const event = { provider: 'hotmart', eventKey: `evt-${unique()}`, eventType: 'PURCHASE_APPROVED' };
    await PaymentProviderEvent.create(event);
    expect(await errorName(PaymentProviderEvent.create(event))).toBe('SequelizeUniqueConstraintError');
  });

  test('one purchase per order and per offer', async () => {
    const { purchase } = chain;
    const copy = { ...purchase.get(), id: undefined, createdAt: undefined, updatedAt: undefined };
    expect(await errorName(ClassPackagePurchase.create(copy))).toBe('SequelizeUniqueConstraintError');
  });

  test('one sync reference per session and provider', async () => {
    const session = await makeSession(chain.teacher, chain.student, chain.purchase);
    await ExternalSyncRef.create({ sessionId: session.id, provider: 'zoom', correlationKey: unique() });
    expect(await errorName(ExternalSyncRef.create({ sessionId: session.id, provider: 'zoom', correlationKey: unique() }))).toBe('SequelizeUniqueConstraintError');
    await ExternalSyncRef.create({ sessionId: session.id, provider: 'google_calendar', correlationKey: unique() });
  });

  test('database checks: balances add up, sessions end after they start', async () => {
    const { purchase } = chain;
    await expect(purchase.update({ unitsAvailable: purchase.unitsAvailable + 1 })).rejects.toThrow(/check constraint/i);
    const start = new Date('2027-02-01T10:00:00Z');
    await expect(ClassSession.create({
      teacherId: chain.teacher.id, kind: 'individual', startsAt: start, endsAt: start, timeZone: 'UTC', localStart: '2027-02-01T10:00', utcOffset: '+00:00', minutes: 50
    })).rejects.toThrow(/check constraint/i);
  });
});

describe('class credits (PACK-19, AC04)', () => {
  const tx = fn => sequelize.transaction(transaction => fn(transaction));

  test('reserve, release and consume move units between buckets without changing the total', async () => {
    const { purchase } = await packageChain({ units: 4 });
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:a${purchase.id}:purchase:${purchase.id}` }, { transaction: t }));
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:b${purchase.id}:purchase:${purchase.id}` }, { transaction: t }));
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'release', units: 1, operationKey: `release:session:a${purchase.id}:purchase:${purchase.id}:v1` }, { transaction: t }));
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'consume', units: 1, operationKey: `consume:session:b${purchase.id}:purchase:${purchase.id}` }, { transaction: t }));
    expect(await credits.balance(purchase.id)).toEqual({ granted: 4, available: 3, reserved: 0, consumed: 1, expired: 0, refunded: 0 });
    expect(await ClassCreditLedger.count({ where: { purchaseId: purchase.id } })).toBe(5);
  });

  test('the same operation key twice moves the balance once; with other data it is a conflict', async () => {
    const { purchase } = await packageChain({ units: 2 });
    const op = { purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:x${purchase.id}:purchase:${purchase.id}` };
    const first = await tx(t => credits.apply(op, { transaction: t }));
    const again = await tx(t => credits.apply(op, { transaction: t }));
    expect([first.replayed, again.replayed]).toEqual([false, true]);
    expect((await credits.balance(purchase.id)).reserved).toBe(1);
    await expect(tx(t => credits.apply({ ...op, units: 2 }, { transaction: t }))).rejects.toMatchObject({ code: 'operation_key_conflict', status: 409 });
  });

  test('never negative: reserving more than available is a 409 insufficient_credit', async () => {
    const { purchase } = await packageChain({ units: 1 });
    await expect(tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 2, operationKey: `reserve:session:big:purchase:${purchase.id}` }, { transaction: t })))
      .rejects.toMatchObject({ code: 'insufficient_credit', status: 409 });
    await expect(tx(t => credits.apply({ purchaseId: purchase.id, operation: 'consume', units: 1, operationKey: `consume:session:none:purchase:${purchase.id}` }, { transaction: t })))
      .rejects.toMatchObject({ code: 'insufficient_credit' });
  });

  test('AC04: with 1 unit left, two concurrent confirmations reserve it only once', async () => {
    const { purchase } = await packageChain({ units: 1 });
    const confirm = session => tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:${session}:purchase:${purchase.id}` }, { transaction: t }));
    const results = await Promise.allSettled([confirm(`c1-${purchase.id}`), confirm(`c2-${purchase.id}`)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.code).toBe('insufficient_credit');
    expect(await credits.balance(purchase.id)).toMatchObject({ available: 0, reserved: 1 });
  });

  test('a paused package cannot reserve but can settle existing reservations', async () => {
    const { purchase } = await packageChain({ units: 2 });
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:p${purchase.id}:purchase:${purchase.id}` }, { transaction: t }));
    await purchase.update({ status: 'paused' });
    await expect(tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:q${purchase.id}:purchase:${purchase.id}` }, { transaction: t })))
      .rejects.toMatchObject({ code: 'package_not_active' });
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'release', units: 1, operationKey: `release:session:p${purchase.id}:purchase:${purchase.id}:v1` }, { transaction: t }));
    expect((await credits.balance(purchase.id)).available).toBe(2);
  });

  test('consuming the last unit exhausts the package; adjustments need an actor and a reason', async () => {
    const { purchase, teacher } = await packageChain({ units: 1 });
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'reserve', units: 1, operationKey: `reserve:session:e${purchase.id}:purchase:${purchase.id}` }, { transaction: t }));
    await tx(t => credits.apply({ purchaseId: purchase.id, operation: 'consume', units: 1, operationKey: `consume:session:e${purchase.id}:purchase:${purchase.id}` }, { transaction: t }));
    expect((await purchase.reload()).status).toBe('exhausted');
    await expect(tx(t => credits.apply({ purchaseId: purchase.id, operation: 'adjust', units: 1, operationKey: `adjust:audit:n${purchase.id}`, adjust: { from: 'consumed', to: 'available' } }, { transaction: t })))
      .rejects.toMatchObject({ code: 'invalid_credit_operation' });
    await tx(async t => {
      const audit = await AuditLog.create({ actorId: teacher.id, action: 'attendance.correct', entityType: 'class_package_purchases', entityId: purchase.id, reason: 'Clase no dictada' }, { transaction: t });
      await credits.apply({ purchaseId: purchase.id, operation: 'adjust', units: 1, operationKey: `adjust:audit:${audit.id}`, actorId: teacher.id, reason: 'Clase no dictada', adjust: { from: 'consumed', to: 'available' } }, { transaction: t });
    });
    expect((await purchase.reload()).status).toBe('active');
    expect(await credits.balance(purchase.id)).toMatchObject({ granted: 1, available: 1, consumed: 0 });
  });

  test('outside a transaction it refuses to run', async () => {
    await expect(credits.apply({ purchaseId: 1, operation: 'grant', units: 1, operationKey: 'grant:order:1' })).rejects.toThrow(/transaction/);
  });
});

describe('outbox and durable jobs (CONTRACT-03/04)', () => {
  const worker = id => ({ workerId: `jest-${id}`, now: new Date(Date.now() + 1000) });
  beforeEach(async () => {
    outbox.unregisterAll();
    await OutboxJob.update({ status: 'cancelled' }, { where: { status: ['pending', 'running'] } }); // only this suite's jobs matter
  });
  afterAll(() => outbox.unregisterAll());

  test('a job enqueued in a rolled back transaction does not exist; dedupeKey never creates a second job', async () => {
    const key = `test:${unique()}`;
    await expect(sequelize.transaction(async transaction => {
      await outbox.enqueue({ topic: 'test.noop', dedupeKey: key }, { transaction });
      throw new Error('business rule failed');
    })).rejects.toThrow('business rule failed');
    expect(await OutboxJob.count({ where: { dedupeKey: key } })).toBe(0);
    const first = await outbox.enqueue({ topic: 'test.noop', dedupeKey: key });
    const second = await outbox.enqueue({ topic: 'test.noop', dedupeKey: key });
    expect([first.created, second.created]).toEqual([true, false]);
    expect(second.job.id).toBe(first.job.id);
  });

  test('runs due jobs once even with two workers polling at the same time', async () => {
    const seen = [];
    outbox.register('test.count', async job => { seen.push(job.id); });
    for (let i = 0; i < 6; i += 1) await outbox.enqueue({ topic: 'test.count', dedupeKey: `count:${unique()}` });
    await outbox.enqueue({ topic: 'test.count', dedupeKey: `count:future:${unique()}`, runAt: new Date(Date.now() + 3600e3) });
    const [a, b] = await Promise.all([outbox.runOnce(worker('a')), outbox.runOnce(worker('b'))]);
    expect(a.done + b.done).toBe(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen).toHaveLength(6);
  });

  test('a failing job is retried with backoff, then marked failed with a sanitized error', async () => {
    outbox.register('test.fail', async () => { throw new Error('boom access_token=abc123 at https://api.zoom.us/x?y'); });
    const { job } = await outbox.enqueue({ topic: 'test.fail', dedupeKey: `fail:${unique()}`, maxAttempts: 2 });
    expect((await outbox.runOnce(worker('a'))).retried).toBe(1);
    await job.reload();
    expect(job.status).toBe('pending');
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 20e3);
    expect(job.lastError).not.toMatch(/abc123|zoom\.us/);
    await job.update({ runAt: new Date() });
    expect((await outbox.runOnce(worker('a'))).failed).toBe(1);
    expect((await job.reload()).status).toBe('failed');
  });

  test('a job left running by a dead worker is claimed again once its lock expires', async () => {
    let runs = 0;
    outbox.register('test.crash', async () => { runs += 1; });
    const { job } = await outbox.enqueue({ topic: 'test.crash', dedupeKey: `crash:${unique()}` });
    await job.update({ status: 'running', lockedBy: 'dead', lockedUntil: new Date(Date.now() + 60e3) });
    expect((await outbox.runOnce(worker('a'))).claimed).toBe(0);
    await job.update({ lockedUntil: new Date(Date.now() - 1000) });
    expect((await outbox.runOnce(worker('a'))).done).toBe(1);
    expect(runs).toBe(1);
  });

  test('a handler that outlives the lease keeps its job, and the rest of the batch is not held (two live workers)', async () => {
    const runs = new Map();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let slowId;
    outbox.register('test.slow', async (job, ctx) => {
      runs.set(job.id, (runs.get(job.id) || 0) + 1);
      if (job.id === slowId) {
        await gate;
        expect(await ctx.stillOwned()).toBe(true);
      }
    });
    slowId = (await outbox.enqueue({ topic: 'test.slow', dedupeKey: `slow:${unique()}`, runAt: new Date(Date.now() - 1000) })).job.id;
    const nextId = (await outbox.enqueue({ topic: 'test.slow', dedupeKey: `slow:${unique()}` })).job.id;
    const leaseMs = 300;

    const a = outbox.runOnce({ workerId: 'jest-a', limit: 2, leaseMs });
    await new Promise(resolve => setTimeout(resolve, leaseMs * 3)); // A is still inside the first handler
    const b = await outbox.runOnce({ workerId: 'jest-b', limit: 2, leaseMs });
    release();
    const resultA = await a;

    expect(runs.get(slowId)).toBe(1); // B did not take the job A is still running
    expect(runs.get(nextId)).toBe(1); // B ran the other one; A did not run it again
    expect(b).toMatchObject({ claimed: 1, done: 1 });
    expect(resultA).toMatchObject({ claimed: 1, done: 1, lost: 0 });
    const statuses = (await OutboxJob.findAll({ where: { id: [slowId, nextId] } })).map(job => job.status);
    expect(statuses).toEqual(['done', 'done']);
  });

  test('a worker that lost its lease does not settle the job', async () => {
    let jobId;
    outbox.register('test.lost', async () => {
      // Another worker took the job over (as after an expired lease) while this handler was running.
      await OutboxJob.update({ lockedBy: 'jest-other:takeover' }, { where: { id: jobId } });
    });
    jobId = (await outbox.enqueue({ topic: 'test.lost', dedupeKey: `lost:${unique()}` })).job.id;
    expect(await outbox.runOnce(worker('a'))).toMatchObject({ claimed: 1, done: 0, lost: 1 });
    expect((await OutboxJob.findByPk(jobId)).status).toBe('running');
  });

  test('cancel() invalidates pending jobs of older versions of an aggregate (AGENDA-08)', async () => {
    const id = Math.floor(Math.random() * 1e9);
    const enqueue = version => outbox.enqueue({ topic: 'reminder.session', aggregateType: 'class_sessions', aggregateId: id, aggregateVersion: version, dedupeKey: `reminder:${id}:v${version}:1:60` });
    await enqueue(1);
    await enqueue(2);
    expect(await outbox.cancel({ aggregateType: 'class_sessions', aggregateId: id, topicPrefix: 'reminder.', beforeVersion: 2 })).toBe(1);
    const statuses = (await OutboxJob.findAll({ where: { aggregateId: id }, order: [['aggregateVersion', 'ASC']] })).map(j => j.status);
    expect(statuses).toEqual(['cancelled', 'pending']);
  });
});

describe('UTC persistence (TZ-01, TZ-T10)', () => {
  test('instants are stored as UTC whatever the MySQL session time zone', async () => {
    const { teacher, student, purchase } = await packageChain({ units: 1 });
    const session = await makeSession(teacher, student, purchase, new Date('2026-10-22T13:00:00Z'));
    const [row] = await sequelize.query("SELECT DATE_FORMAT(startsAt, '%Y-%m-%d %H:%i:%s') AS raw FROM class_sessions WHERE id = ?", { replacements: [session.id], type: QueryTypes.SELECT });
    expect(row.raw).toBe('2026-10-22 13:00:00');
    expect((await ClassSession.findByPk(session.id)).startsAt.toISOString()).toBe('2026-10-22T13:00:00.000Z');
  });
});

describe('feature flags and capabilities (§16)', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('every module is off by default and GET /api/features reports it', async () => {
    for (const name of Object.values(features.FEATURES)) delete process.env[name];
    const res = await as(null).get('/api/features');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chat: false, class_packages: false, class_scheduling: false, google_calendar: false, zoom: false });
    process.env.FEATURE_CHAT = '1';
    expect((await as(null).get('/api/features')).body.chat).toBe(true);
  });

  test('requireFeature answers 404 feature_disabled while the module is off', () => {
    delete process.env.FEATURE_ZOOM;
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const next = jest.fn();
    features.requireFeature('zoom')({}, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'feature_disabled' });
    process.env.FEATURE_ZOOM = '1';
    features.requireFeature('zoom')({}, res, next);
    expect(next).toHaveBeenCalled();
    expect(() => features.requireFeature('nope')).toThrow(/Unknown feature/);
  });

  test('fake integrations are refused in production', () => {
    process.env.INTEGRATIONS_FAKE = '1';
    process.env.NODE_ENV = 'production';
    expect(() => features.assertSafe()).toThrow(/INTEGRATIONS_FAKE/);
    process.env.NODE_ENV = 'test';
    expect(() => features.assertSafe()).not.toThrow();
  });

  test('the class capabilities exist and are never given by the teacher role or to test accounts', () => {
    const keys = ['class_teachers.manage', 'class_packages.manage_all', 'class_payments.review', 'class_credits.adjust', 'class_sessions.support', 'chat.moderate'];
    expect(PERMISSION_KEYS).toEqual(expect.arrayContaining(keys));
    expect(effectivePermissions({ role: 'teacher', email: 't@example.com', permissions: null })).toEqual([]);
    expect(effectivePermissions({ role: 'teacher', email: 't@example.com', isTestAccount: true, permissions: keys })).toEqual([]);
  });
});

describe('test account cleanup covers the new modules (CONTRACT-05, AC20)', () => {
  test('a test teacher with test students is deleted with all their chat, packages and classes', async () => {
    const chain = await packageChain({ units: 2, test: true });
    const session = await makeSession(chain.teacher, chain.student, chain.purchase);
    await sequelize.transaction(t => credits.apply({ purchaseId: chain.purchase.id, operation: 'reserve', units: 1, classSessionId: session.id, operationKey: `reserve:session:${session.id}:purchase:${chain.purchase.id}` }, { transaction: t }));
    await Message.create({ conversationId: chain.conversation.id, seq: 1, senderId: chain.student.id, type: 'text', body: 'Hola', clientMessageId: 'x' });
    await Message.create({ conversationId: chain.conversation.id, seq: 2, type: 'offer', offerId: chain.offer.id });
    await ExternalSyncRef.create({ sessionId: session.id, provider: 'zoom', correlationKey: unique() });
    await outbox.enqueue({ topic: 'reminder.session', aggregateType: 'class_sessions', aggregateId: session.id, aggregateVersion: 1, dedupeKey: `reminder:${session.id}:v1:x:60` });

    await deleteTestUser(chain.teacher.id);
    expect(await User.findByPk(chain.teacher.id)).toBeNull();
    expect(await Conversation.findByPk(chain.conversation.id)).toBeNull();
    expect(await ClassOffer.findByPk(chain.offer.id)).toBeNull();
    expect(await ClassPackagePurchase.findByPk(chain.purchase.id)).toBeNull();
    expect(await ClassSession.findByPk(session.id)).toBeNull();
    expect(await OutboxJob.count({ where: { aggregateType: 'class_sessions', aggregateId: session.id } })).toBe(0);
    // The test student is not deleted by deleting the teacher, but nothing of theirs points to the teacher any more.
    expect(await User.findByPk(chain.student.id)).not.toBeNull();
    await deleteTestUser(chain.student.id);
    expect(await User.findByPk(chain.student.id)).toBeNull();
  });

  test('a test teacher who chatted or sold to a real student is not deleted: 409 and nothing removed', async () => {
    const teacher = await makeUser('teacher', { test: true });
    const realStudent = await makeUser('student');
    const chain = await packageChain({ units: 1, teacher, student: realStudent });
    await expect(deleteTestUser(teacher.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await User.findByPk(teacher.id)).not.toBeNull();
    expect(await ClassPackagePurchase.findByPk(chain.purchase.id)).not.toBeNull();
    expect(await Conversation.findByPk(chain.conversation.id)).not.toBeNull();
    // Other suites delete every test account; this one must not block them.
    await teacher.update({ isTestAccount: false });
  });
});

describe('test account cleanup under concurrency (CONTRACT-05)', () => {
  test('a real participant added while the cleanup runs is seen (409), never deleted by the cascade', async () => {
    const chain = await packageChain({ units: 1, test: true });
    const session = await makeSession(chain.teacher, chain.student, chain.purchase);
    const real = await makeUser('student');

    // Writer: adds a real student to the test teacher's session and commits only after the cleanup has started.
    let commit;
    const committed = new Promise(resolve => { commit = resolve; });
    const writer = sequelize.transaction(async transaction => {
      await ClassSessionParticipant.create({ sessionId: session.id, userId: real.id }, { transaction });
      await committed;
    });
    await new Promise(resolve => setTimeout(resolve, 200)); // the insert is done, not committed
    const cleanup = deleteTestUser(chain.teacher.id).then(() => 'deleted', error => error.statusCode);
    await new Promise(resolve => setTimeout(resolve, 500)); // the cleanup is running (or waiting on the writer)
    commit();
    await writer;

    expect(await cleanup).toBe(409);
    expect(await ClassSessionParticipant.count({ where: { sessionId: session.id, userId: real.id } })).toBe(1);
    expect(await ClassSession.findByPk(session.id)).not.toBeNull();
    expect(await User.findByPk(chain.teacher.id)).not.toBeNull();
    await chain.teacher.update({ isTestAccount: false }); // other suites delete every test account
    await chain.student.update({ isTestAccount: false });
  });
});

describe('migration rollback guard', () => {
  test('rolling back with class data refuses without CONFIRM_CLASSES_FOUNDATION_DATA_LOSS and changes nothing', async () => {
    await packageChain({ units: 1 });
    const migration = require('../migrations/20261108000000-create-classes-chat-foundation.js');
    delete process.env.CONFIRM_CLASSES_FOUNDATION_DATA_LOSS;
    await expect(migration.down(sequelize.getQueryInterface(), require('sequelize'))).rejects.toThrow(/CONFIRM_CLASSES_FOUNDATION_DATA_LOSS=yes/);
    expect((await sequelize.getQueryInterface().showAllTables()).map(String)).toEqual(expect.arrayContaining(['class_credit_ledger', 'outbox_jobs']));
  });
});
