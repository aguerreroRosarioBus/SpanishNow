'use strict';

/**
 * W00: schema for private chat, class packages sold through Hotmart, credit ledger, scheduled sessions, Calendar/Zoom
 * references, durable outbox jobs, legal acceptances and audit log. Contract: docs/clases-chat-integraciones/CONTRATO.md.
 * Also adds the language and time zone preferences to users.
 *
 * Safe to re-run: creates only missing tables, columns, indexes and checks. Rollback refuses to drop rows unless
 * CONFIRM_CLASSES_FOUNDATION_DATA_LOSS=yes.
 */

const { createHash } = require('crypto');

const CONFIRM = 'CONFIRM_CLASSES_FOUNDATION_DATA_LOSS';

// MySQL identifiers are limited to 64 characters: long names keep a readable prefix and a stable hash.
const identifier = name => (name.length <= 64 ? name : `${name.slice(0, 55)}_${createHash('md5').update(name).digest('hex').slice(0, 8)}`);

async function index(q, table, fields, options = {}) {
  const name = identifier(options.name || `${table}_${fields.map(f => f.replace(/[A-Z]/g, c => '_' + c.toLowerCase())).join('_')}`);
  if (!(await q.showIndex(table)).some(i => i.name === name)) await q.addIndex(table, fields, { ...options, name });
}

async function check(q, table, name, expression) {
  const [rows] = await q.sequelize.query(
    'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    { replacements: [table, name] }
  );
  if (!rows.length) await q.sequelize.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` CHECK (${expression})`);
}

// Tables in creation order (parents first). Rollback drops them in reverse.
function tables(S) {
  const id = { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false };
  const bigId = { type: S.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false };
  const ref = (model, onDelete = 'RESTRICT', allowNull = false, type = S.INTEGER) => ({ type, allowNull, references: { model, key: 'id' }, onDelete, onUpdate: 'CASCADE' });
  const user = (onDelete = 'RESTRICT', allowNull = false) => ref('users', onDelete, allowNull);
  const date = (allowNull = true) => ({ type: S.DATE, allowNull });
  const str = (length, allowNull = true) => ({ type: S.STRING(length), allowNull });
  const int = (defaultValue, allowNull = false) => ({ type: S.INTEGER, allowNull, ...(defaultValue === undefined ? {} : { defaultValue }) });
  const units = () => ({ type: S.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
  const money = { amount: int(), currency: { type: S.CHAR(3), allowNull: false } };
  const timestamps = { createdAt: date(false), updatedAt: date(false) };
  const created = { createdAt: date(false) };
  const schedule = {
    startsAt: date(false), endsAt: date(false),
    timeZone: str(64, false), localStart: { type: S.CHAR(16), allowNull: false }, utcOffset: { type: S.CHAR(6), allowNull: false },
    disambiguation: { type: S.ENUM('none', 'earlier', 'later'), allowNull: false, defaultValue: 'none' },
    minutes: { type: S.SMALLINT.UNSIGNED, allowNull: false }
  };

  return [
    {
      name: 'teacher_class_settings',
      columns: {
        userId: { ...user('CASCADE'), primaryKey: true },
        classesEnabledAt: date(), acceptsInquiries: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        salesPausedAt: date(),
        sessionBufferMinutes: { type: S.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 10 },
        minLeadTimeHours: { type: S.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 24 },
        ...timestamps
      }
    },
    {
      name: 'conversations',
      columns: {
        id, teacherId: user(), studentId: user(), createdById: user('SET NULL', true),
        lastMessageSeq: int(0), lastMessageAt: date(), teacherFirstReplyAt: date(), ...timestamps
      },
      indexes: [[['teacherId', 'studentId'], { unique: true }], [['studentId', 'lastMessageAt']], [['teacherId', 'lastMessageAt']]]
    },
    {
      name: 'conversation_participants',
      columns: {
        id, conversationId: ref('conversations', 'CASCADE'), userId: user(),
        role: { type: S.ENUM('teacher', 'student'), allowNull: false },
        lastReadSeq: int(0), emailNotifiedSeq: int(0), blockedAt: date(), reportedAt: date(), reportReason: str(500), ...timestamps
      },
      indexes: [[['conversationId', 'userId'], { unique: true }], [['userId']]]
    },
    {
      name: 'class_policy_versions',
      columns: { id, version: int(), rules: { type: S.JSON, allowNull: false }, createdById: user('SET NULL', true), ...created },
      indexes: [[['version'], { unique: true }]]
    },
    {
      name: 'class_package_templates',
      columns: {
        id, teacherId: user(), templateKey: str(64, false),
        status: { type: S.ENUM('draft', 'active', 'paused', 'archived'), allowNull: false, defaultValue: 'draft' },
        currentVersionId: int(undefined, true), ...timestamps
      },
      indexes: [[['teacherId', 'templateKey'], { unique: true }], [['status']]]
    },
    {
      name: 'class_package_template_versions',
      columns: {
        id, templateId: ref('class_package_templates', 'CASCADE'), version: int(),
        nameEn: str(150, false), nameEs: str(150, false), descriptionEn: { type: S.TEXT }, descriptionEs: { type: S.TEXT },
        modality: { type: S.ENUM('individual', 'group'), allowNull: false },
        groupSize: { type: S.TINYINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        billing: { type: S.ENUM('per_buyer', 'per_group', 'per_seat'), allowNull: false },
        sessionsCount: { type: S.SMALLINT.UNSIGNED, allowNull: false },
        minutesPerSession: { type: S.SMALLINT.UNSIGNED, allowNull: false },
        seatsCovered: { type: S.TINYINT.UNSIGNED, allowNull: false, defaultValue: 1 },
        priceAmount: int(), currency: { type: S.CHAR(3), allowNull: false },
        validityHours: int(), policyVersionId: ref('class_policy_versions'),
        hotmartProductId: str(40), hotmartOfferCode: str(40), hotmartCheckoutUrl: str(500),
        expectations: { type: S.JSON }, createdById: user('SET NULL', true), ...created
      },
      indexes: [[['templateId', 'version'], { unique: true }], [['hotmartProductId', 'hotmartOfferCode']]]
    },
    {
      name: 'class_cohorts',
      columns: {
        id, teacherId: user(), templateVersionId: ref('class_package_template_versions'),
        groupSize: { type: S.TINYINT.UNSIGNED, allowNull: false },
        formingDeadlineAt: date(false), tentativeStartsAt: date(),
        status: { type: S.ENUM('forming', 'ready', 'cancelled', 'completed'), allowNull: false, defaultValue: 'forming' },
        ...timestamps
      },
      indexes: [[['teacherId', 'status']], [['status', 'formingDeadlineAt']]]
    },
    {
      name: 'class_cohort_members',
      columns: {
        id, cohortId: ref('class_cohorts', 'CASCADE'), userId: user(), invitedById: user('SET NULL', true),
        status: { type: S.ENUM('invited', 'accepted', 'declined', 'removed'), allowNull: false, defaultValue: 'invited' },
        respondedAt: date(), ...timestamps
      },
      indexes: [[['cohortId', 'userId'], { unique: true }], [['userId']]]
    },
    {
      name: 'class_offers',
      columns: {
        id, conversationId: ref('conversations'), teacherId: user(), buyerId: user(), cohortId: ref('class_cohorts', 'RESTRICT', true),
        templateVersionId: ref('class_package_template_versions'), policyVersionId: ref('class_policy_versions'),
        replacesOfferId: ref('class_offers', 'RESTRICT', true),
        status: { type: S.ENUM('draft', 'sent', 'checkout_pending', 'paid', 'expired', 'cancelled', 'replaced'), allowNull: false, defaultValue: 'draft' },
        snapshot: { type: S.JSON, allowNull: false }, ...money,
        sessionsCount: { type: S.SMALLINT.UNSIGNED, allowNull: false }, minutesPerSession: { type: S.SMALLINT.UNSIGNED, allowNull: false },
        seatsCovered: { type: S.TINYINT.UNSIGNED, allowNull: false }, validityHours: int(),
        hotmartProductId: str(40), hotmartOfferCode: str(40),
        idempotencyKey: str(64), sentAt: date(), expiresAt: date(), cancelledAt: date(), cancelReason: str(500), ...timestamps
      },
      indexes: [
        [['replacesOfferId'], { unique: true }], [['teacherId', 'idempotencyKey'], { unique: true }],
        [['conversationId', 'createdAt']], [['buyerId', 'status']], [['status', 'expiresAt']]
      ]
    },
    {
      name: 'class_offer_beneficiaries',
      columns: { id, offerId: ref('class_offers', 'CASCADE'), userId: user(), ...created },
      indexes: [[['offerId', 'userId'], { unique: true }], [['userId']]]
    },
    {
      name: 'class_package_orders',
      columns: {
        id, offerId: ref('class_offers'), buyerId: user(), ...money,
        provider: { type: S.ENUM('hotmart', 'fake'), allowNull: false },
        status: { type: S.ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'paid_needs_review'), allowNull: false, defaultValue: 'pending' },
        checkoutRef: { type: S.CHAR(32), allowNull: false }, pendingOfferId: int(undefined, true), idempotencyKey: str(64),
        providerTransactionId: str(64), providerProductId: str(40), providerOfferCode: str(40),
        reportedAmount: int(undefined, true), reportedCurrency: { type: S.CHAR(3) }, buyerEmailReported: str(255),
        refundedAmount: int(0), paidAt: date(), refundedAt: date(), failedAt: date(),
        reviewReason: str(64), reviewResolvedAt: date(), reviewResolvedById: user('SET NULL', true), ...timestamps
      },
      indexes: [
        [['checkoutRef'], { unique: true }], [['pendingOfferId'], { unique: true }], [['providerTransactionId'], { unique: true }],
        [['offerId']], [['buyerId', 'status']], [['status', 'updatedAt']]
      ]
    },
    {
      name: 'payment_provider_events',
      columns: {
        id: bigId, provider: { type: S.ENUM('hotmart', 'fake'), allowNull: false }, eventKey: str(191, false), eventType: str(64, false),
        providerTransactionId: str(64), occurredAt: date(), orderId: ref('class_package_orders', 'SET NULL', true),
        outcome: { type: S.ENUM('received', 'applied', 'ignored', 'needs_review', 'failed'), allowNull: false, defaultValue: 'received' },
        payload: { type: S.JSON }, error: str(500), processedAt: date(), ...created
      },
      indexes: [[['provider', 'eventKey'], { unique: true }], [['providerTransactionId']], [['outcome', 'createdAt']]]
    },
    {
      name: 'class_package_purchases',
      columns: {
        id, orderId: ref('class_package_orders'), offerId: ref('class_offers'), teacherId: user(), buyerId: user(),
        cohortId: ref('class_cohorts', 'RESTRICT', true), templateVersionId: ref('class_package_template_versions'),
        policyVersionId: ref('class_policy_versions'), snapshot: { type: S.JSON, allowNull: false },
        minutesPerSession: { type: S.SMALLINT.UNSIGNED, allowNull: false }, seatsCovered: { type: S.TINYINT.UNSIGNED, allowNull: false },
        status: { type: S.ENUM('active', 'paused', 'exhausted', 'expired', 'cancelled'), allowNull: false, defaultValue: 'active' },
        paidAt: date(false), expiresAt: date(false), pausedAt: date(), pausedHoursUsed: int(0), pauseCount: int(0), cancelledAt: date(),
        version: int(1),
        unitsGranted: units(), unitsAvailable: units(), unitsReserved: units(), unitsConsumed: units(), unitsExpired: units(), unitsRefunded: units(),
        ...timestamps
      },
      indexes: [[['orderId'], { unique: true }], [['offerId'], { unique: true }], [['buyerId', 'status']], [['teacherId', 'status']], [['status', 'expiresAt']]],
      checks: [['class_package_purchases_units_balance', 'unitsGranted = unitsAvailable + unitsReserved + unitsConsumed + unitsExpired + unitsRefunded']]
    },
    {
      name: 'class_package_beneficiaries',
      columns: { id, purchaseId: ref('class_package_purchases', 'CASCADE'), userId: user(), ...created },
      indexes: [[['purchaseId', 'userId'], { unique: true }], [['userId']]]
    },
    {
      name: 'class_sessions',
      columns: {
        id, teacherId: user(), kind: { type: S.ENUM('individual', 'group'), allowNull: false },
        cohortId: ref('class_cohorts', 'RESTRICT', true),
        status: {
          type: S.ENUM('draft', 'forming', 'proposed', 'confirmed', 'completed', 'declined', 'expired', 'cancelled', 'student_no_show', 'teacher_no_show'),
          allowNull: false, defaultValue: 'draft'
        },
        version: int(1), ...schedule, liveClassId: ref('live_classes', 'SET NULL', true),
        idempotencyKey: str(64), confirmedAt: date(), cancelledAt: date(), cancelledById: user('SET NULL', true),
        cancelReason: str(500), chargeWaivedReason: str(500), ...timestamps
      },
      indexes: [[['teacherId', 'startsAt']], [['status', 'startsAt']], [['teacherId', 'idempotencyKey'], { unique: true }]],
      checks: [['class_sessions_interval', 'endsAt > startsAt']]
    },
    {
      name: 'class_session_proposals',
      columns: {
        id, sessionId: ref('class_sessions', 'CASCADE'), version: int(),
        kind: { type: S.ENUM('initial', 'reschedule'), allowNull: false },
        status: { type: S.ENUM('pending', 'accepted', 'declined', 'expired', 'superseded', 'withdrawn'), allowNull: false, defaultValue: 'pending' },
        ...schedule, proposedById: user(), expiresAt: date(false),
        leadTimeException: { type: S.BOOLEAN, allowNull: false, defaultValue: false }, resolvedAt: date(), ...timestamps
      },
      indexes: [[['sessionId', 'version'], { unique: true }], [['status', 'expiresAt']], [['status', 'startsAt']]],
      checks: [['class_session_proposals_interval', 'endsAt > startsAt']]
    },
    {
      name: 'class_session_participants',
      columns: {
        id, sessionId: ref('class_sessions', 'CASCADE'), userId: user(), purchaseId: ref('class_package_purchases', 'RESTRICT', true),
        status: { type: S.ENUM('invited', 'accepted', 'declined', 'confirmed', 'cancelled'), allowNull: false, defaultValue: 'invited' },
        acceptedVersion: int(undefined, true), acceptedAt: date(),
        attendance: { type: S.ENUM('pending', 'attended', 'student_no_show', 'teacher_no_show', 'excused'), allowNull: false, defaultValue: 'pending' },
        attendanceMarkedById: user('SET NULL', true), attendanceMarkedAt: date(), ...timestamps
      },
      indexes: [[['sessionId', 'userId'], { unique: true }], [['userId']], [['purchaseId']]]
    },
    {
      name: 'class_credit_ledger',
      columns: {
        id: bigId, purchaseId: ref('class_package_purchases', 'CASCADE'),
        operation: { type: S.ENUM('grant', 'reserve', 'release', 'consume', 'expire', 'refund', 'adjust'), allowNull: false },
        units: { type: S.INTEGER.UNSIGNED, allowNull: false },
        fromBucket: { type: S.ENUM('none', 'available', 'reserved', 'consumed'), allowNull: false },
        toBucket: { type: S.ENUM('none', 'available', 'reserved', 'consumed', 'expired', 'refunded'), allowNull: false },
        operationKey: str(191, false), classSessionId: ref('class_sessions', 'SET NULL', true), actorId: user('SET NULL', true),
        reason: str(255), ...created
      },
      indexes: [[['operationKey'], { unique: true }], [['purchaseId', 'id']], [['classSessionId']]],
      checks: [['class_credit_ledger_units', 'units > 0']]
    },
    {
      name: 'external_connections',
      columns: {
        id, userId: user('CASCADE'), provider: { type: S.ENUM('google_calendar', 'zoom'), allowNull: false },
        status: { type: S.ENUM('pending', 'connected', 'needs_attention', 'revoked', 'disconnected'), allowNull: false, defaultValue: 'pending' },
        accountEmail: str(254), credentials: { type: S.TEXT }, scopes: { type: S.TEXT },
        targetCalendarId: str(255), busyCalendarIds: { type: S.JSON }, tokenExpiresAt: date(), refreshLockedUntil: date(),
        oauthStateHash: str(64), oauthVerifier: { type: S.TEXT }, oauthExpiresAt: date(), lastError: str(500), version: int(1), ...timestamps
      },
      indexes: [[['userId', 'provider'], { unique: true }], [['oauthStateHash'], { unique: true }]]
    },
    {
      name: 'external_sync_refs',
      columns: {
        id, sessionId: ref('class_sessions', 'CASCADE'), provider: { type: S.ENUM('google_calendar', 'zoom'), allowNull: false },
        connectionId: ref('external_connections', 'SET NULL', true), externalId: str(255), calendarId: str(255), etag: str(255),
        syncedVersion: int(0), status: { type: S.ENUM('pending', 'ready', 'needs_attention', 'cancelled'), allowNull: false, defaultValue: 'pending' },
        correlationKey: str(64, false), joinUrl: str(1000), manualJoinUrl: str(1000), manualJoinUrlById: user('SET NULL', true),
        lastError: str(500), attempts: int(0), ...timestamps
      },
      indexes: [[['sessionId', 'provider'], { unique: true }], [['correlationKey'], { unique: true }], [['status', 'updatedAt']]]
    },
    {
      name: 'messages',
      columns: {
        id: bigId, conversationId: ref('conversations', 'CASCADE'), seq: int(), senderId: user('RESTRICT', true),
        type: { type: S.ENUM('text', 'offer', 'session_proposal', 'system_event'), allowNull: false },
        body: { type: S.TEXT }, clientMessageId: str(64),
        offerId: ref('class_offers', 'RESTRICT', true), classSessionId: ref('class_sessions', 'RESTRICT', true), proposalVersion: int(undefined, true),
        eventCode: str(64), eventParams: { type: S.JSON },
        contextType: { type: S.ENUM('course', 'package', 'session') }, contextId: int(undefined, true),
        hiddenAt: date(), hiddenById: user('SET NULL', true), hiddenReason: str(500), ...created
      },
      indexes: [[['conversationId', 'seq'], { unique: true }], [['conversationId', 'senderId', 'clientMessageId'], { unique: true }], [['senderId', 'createdAt']]]
    },
    {
      name: 'rate_limit_buckets',
      columns: { id: bigId, bucketKey: str(191, false), windowStart: date(false), hits: int(0), ...timestamps },
      indexes: [[['bucketKey', 'windowStart'], { unique: true }], [['windowStart']]]
    },
    {
      name: 'outbox_jobs',
      columns: {
        id: bigId, topic: str(64, false), aggregateType: str(64), aggregateId: int(undefined, true), aggregateVersion: int(undefined, true),
        dedupeKey: str(191, false), payload: { type: S.JSON },
        status: { type: S.ENUM('pending', 'running', 'done', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
        attempts: int(0), maxAttempts: int(8), runAt: date(false), lockedBy: str(64), lockedUntil: date(), lastError: str(500), doneAt: date(),
        ...timestamps
      },
      indexes: [[['dedupeKey'], { unique: true }], [['status', 'runAt']], [['aggregateType', 'aggregateId']]]
    },
    {
      name: 'legal_acceptances',
      columns: {
        id, userId: user(), documentKey: str(32, false), documentVersion: str(32, false), locale: { type: S.ENUM('en', 'es') },
        context: { type: S.ENUM('signup', 'checkout', 'update'), allowNull: false }, contextType: str(32), contextId: int(undefined, true),
        acceptedAt: date(false), ...created
      },
      indexes: [[['userId', 'documentKey']]]
    },
    {
      name: 'audit_logs',
      columns: {
        id: bigId, actorId: user('SET NULL', true), impersonatedById: user('SET NULL', true), action: str(64, false),
        entityType: str(64, false), entityId: int(undefined, true), reason: str(500), data: { type: S.JSON }, ...created
      },
      indexes: [[['entityType', 'entityId']], [['actorId', 'createdAt']]]
    }
  ];
}

const USER_COLUMNS = S => ({
  locale: { type: S.ENUM('en', 'es'), allowNull: true },
  timeZone: { type: S.STRING(64), allowNull: true },
  timeZoneConfirmedAt: { type: S.DATE, allowNull: true }
});

module.exports = {
  async up(q, S) {
    const existing = new Set((await q.showAllTables()).map(String));
    for (const table of tables(S)) {
      if (!existing.has(table.name)) {
        await q.createTable(table.name, table.columns, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
      }
      for (const [fields, options] of table.indexes || []) await index(q, table.name, fields, options);
      for (const [name, expression] of table.checks || []) await check(q, table.name, name, expression);
    }
    // Added after both tables exist (templates <-> versions reference each other).
    const [fk] = await q.sequelize.query(
      "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'class_package_templates' AND CONSTRAINT_NAME = 'class_package_templates_current_version_fk'"
    );
    if (!fk.length) {
      await q.addConstraint('class_package_templates', {
        fields: ['currentVersionId'], type: 'foreign key', name: 'class_package_templates_current_version_fk',
        references: { table: 'class_package_template_versions', field: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE'
      });
    }

    const users = await q.describeTable('users');
    for (const [name, spec] of Object.entries(USER_COLUMNS(S))) {
      if (!users[name]) await q.addColumn('users', name, spec);
    }
  },

  async down(q, S) {
    const existing = new Set((await q.showAllTables()).map(String));
    const names = tables(S).map(t => t.name).filter(name => existing.has(name)).reverse();
    if (process.env[CONFIRM] !== 'yes') {
      for (const table of names) {
        const [[row]] = await q.sequelize.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        if (Number(row.total) > 0) throw new Error(`${table} has rows; export them and set ${CONFIRM}=yes before rollback`);
      }
      const [[prefs]] = await q.sequelize.query('SELECT COUNT(*) AS total FROM users WHERE locale IS NOT NULL OR timeZone IS NOT NULL').catch(() => [[{ total: 0 }]]);
      if (Number(prefs.total) > 0) throw new Error(`Users have language or time zone preferences; set ${CONFIRM}=yes before rollback`);
    }
    if (existing.has('class_package_templates')) {
      const [fk] = await q.sequelize.query(
        "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'class_package_templates' AND CONSTRAINT_NAME = 'class_package_templates_current_version_fk'"
      );
      if (fk.length) await q.removeConstraint('class_package_templates', 'class_package_templates_current_version_fk');
    }
    for (const table of names) await q.dropTable(table);

    const users = await q.describeTable('users');
    for (const name of Object.keys(USER_COLUMNS(S)).reverse()) {
      if (users[name]) await q.removeColumn('users', name);
    }
  }
};
