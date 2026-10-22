// Classes/chat data of test accounts, for adminUsers.deleteTestUsers (CONTRACT-05, CONTRATO.md §13).
// Collects every conversation, cohort, offer, order, purchase and session a test account takes part in. If any of them
// involves a real user, nothing may be deleted: those messages and commercial records are not ours to remove.
// Runs inside the transaction of adminUsers.deleteTestUsers.
const { QueryTypes } = require('sequelize');

const sequelize = require('../config/database');

const select = (sql, replacements, transaction) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
const ids = rows => [...new Set(rows.map(row => row.id))];
const IN = list => (list.length ? list : [0]); // MySQL rejects IN ()

// Every read below is a locking read (FOR UPDATE), one per indexed column, inside the cleanup transaction. It sees the
// latest committed rows and locks them plus the index ranges it scanned, so a writer that adds a participant, member,
// beneficiary or message to an aggregate in scope either waits for the cleanup (and then fails its foreign key) or is
// seen by it (and the cleanup answers 409). A snapshot read would miss it and the DELETE would cascade over it.
const lockedIds = async (sql, replacements, transaction, column = 'id') =>
  (await select(`${sql} FOR UPDATE`, replacements, transaction)).map(row => row[column]);
const union = (...lists) => [...new Set(lists.flat())];

/** Ids of the class/chat aggregates a set of users takes part in, locked. */
async function collect(userIds, transaction) {
  const T = IN(userIds);
  const q = (sql, replacements, column) => lockedIds(sql, replacements, transaction, column);
  const conversations = union(
    await q('SELECT id FROM conversations WHERE teacherId IN (:T)', { T }),
    await q('SELECT id FROM conversations WHERE studentId IN (:T)', { T }));
  const cohorts = union(
    await q('SELECT id FROM class_cohorts WHERE teacherId IN (:T)', { T }),
    await q('SELECT cohortId FROM class_cohort_members WHERE userId IN (:T)', { T }, 'cohortId'));
  const offers = union(
    await q('SELECT id FROM class_offers WHERE teacherId IN (:T)', { T }),
    await q('SELECT id FROM class_offers WHERE buyerId IN (:T)', { T }),
    await q('SELECT id FROM class_offers WHERE conversationId IN (:C)', { C: IN(conversations) }),
    await q('SELECT id FROM class_offers WHERE cohortId IN (:K)', { K: IN(cohorts) }),
    await q('SELECT offerId FROM class_offer_beneficiaries WHERE userId IN (:T)', { T }, 'offerId'));
  const orders = union(
    await q('SELECT id FROM class_package_orders WHERE buyerId IN (:T)', { T }),
    await q('SELECT id FROM class_package_orders WHERE offerId IN (:O)', { O: IN(offers) }));
  const purchases = union(
    await q('SELECT id FROM class_package_purchases WHERE teacherId IN (:T)', { T }),
    await q('SELECT id FROM class_package_purchases WHERE buyerId IN (:T)', { T }),
    await q('SELECT id FROM class_package_purchases WHERE orderId IN (:R)', { R: IN(orders) }),
    await q('SELECT id FROM class_package_purchases WHERE offerId IN (:O)', { O: IN(offers) }),
    await q('SELECT purchaseId FROM class_package_beneficiaries WHERE userId IN (:T)', { T }, 'purchaseId'));
  const sessions = union(
    await q('SELECT id FROM class_sessions WHERE teacherId IN (:T)', { T }),
    await q('SELECT id FROM class_sessions WHERE cohortId IN (:K)', { K: IN(cohorts) }),
    await q('SELECT sessionId FROM class_session_participants WHERE userId IN (:T)', { T }, 'sessionId'),
    await q('SELECT sessionId FROM class_session_participants WHERE purchaseId IN (:P)', { P: IN(purchases) }, 'sessionId'));
  // Lock every aggregate root, also those reached only through a child row.
  for (const [table, ids] of [['conversations', conversations], ['class_cohorts', cohorts], ['class_offers', offers],
    ['class_package_orders', orders], ['class_package_purchases', purchases], ['class_sessions', sessions]]) {
    if (ids.length) await q(`SELECT id FROM ${table} WHERE id IN (:ids)`, { ids });
  }
  return { conversations, cohorts, offers, orders, purchases, sessions };
}

/** How many real (non-test) users take part in those aggregates, read under locks (see collect). */
async function realUsersIn(scope, transaction) {
  const { conversations: C, cohorts: K, offers: O, orders: R, purchases: P, sessions: S } = Object.fromEntries(
    Object.entries(scope).map(([key, list]) => [key, IN(list)]));
  const q = (sql, replacements) => lockedIds(sql, replacements, transaction, 'userId');
  const involved = union(
    await q('SELECT teacherId AS userId FROM conversations WHERE id IN (:C)', { C }),
    await q('SELECT studentId AS userId FROM conversations WHERE id IN (:C)', { C }),
    await q('SELECT userId FROM conversation_participants WHERE conversationId IN (:C)', { C }),
    await q('SELECT senderId AS userId FROM messages WHERE conversationId IN (:C) AND senderId IS NOT NULL', { C }),
    await q('SELECT teacherId AS userId FROM class_cohorts WHERE id IN (:K)', { K }),
    await q('SELECT userId FROM class_cohort_members WHERE cohortId IN (:K)', { K }),
    await q('SELECT teacherId AS userId FROM class_offers WHERE id IN (:O)', { O }),
    await q('SELECT buyerId AS userId FROM class_offers WHERE id IN (:O)', { O }),
    await q('SELECT userId FROM class_offer_beneficiaries WHERE offerId IN (:O)', { O }),
    await q('SELECT buyerId AS userId FROM class_package_orders WHERE id IN (:R)', { R }),
    await q('SELECT teacherId AS userId FROM class_package_purchases WHERE id IN (:P)', { P }),
    await q('SELECT buyerId AS userId FROM class_package_purchases WHERE id IN (:P)', { P }),
    await q('SELECT userId FROM class_package_beneficiaries WHERE purchaseId IN (:P)', { P }),
    await q('SELECT teacherId AS userId FROM class_sessions WHERE id IN (:S)', { S }),
    await q('SELECT userId FROM class_session_participants WHERE sessionId IN (:S)', { S })
  ).filter(id => id !== null);
  if (!involved.length) return 0;
  // FOR SHARE: nobody turns one of these accounts into (or out of) a test account until the cleanup commits.
  const [{ total }] = await select('SELECT COUNT(*) AS total FROM users WHERE id IN (:U) AND isTestAccount = 0 FOR SHARE', { U: involved }, transaction);
  return Number(total);
}

/** Deletes those aggregates and the users' own class settings, in foreign key order. */
async function remove(userIds, scope, transaction) {
  const run = (sql, replacements) => sequelize.query(sql, { replacements, transaction });
  const T = IN(userIds);
  const { conversations: C, cohorts: K, offers: O, orders: R, purchases: P, sessions: S } = Object.fromEntries(
    Object.entries(scope).map(([key, list]) => [key, IN(list)]));
  // Jobs are keyed by the table name of their aggregate (CONTRATO.md §8).
  await run(
    `DELETE FROM outbox_jobs WHERE (aggregateType = 'conversations' AND aggregateId IN (:C)) OR (aggregateType = 'class_cohorts' AND aggregateId IN (:K))
       OR (aggregateType = 'class_offers' AND aggregateId IN (:O)) OR (aggregateType = 'class_package_orders' AND aggregateId IN (:R))
       OR (aggregateType = 'class_package_purchases' AND aggregateId IN (:P)) OR (aggregateType = 'class_sessions' AND aggregateId IN (:S))`,
    { C, K, O, R, P, S });
  await run('DELETE FROM messages WHERE conversationId IN (:C) OR offerId IN (:O) OR classSessionId IN (:S)', { C, O, S });
  await run('DELETE FROM class_sessions WHERE id IN (:S)', { S }); // cascades proposals, participants and sync references
  await run('DELETE FROM class_package_purchases WHERE id IN (:P)', { P }); // cascades ledger and beneficiaries
  await run('DELETE FROM payment_provider_events WHERE orderId IN (:R)', { R });
  await run('DELETE FROM class_package_orders WHERE id IN (:R)', { R });
  await run('UPDATE class_offers SET replacesOfferId = NULL WHERE id IN (:O)', { O });
  await run('DELETE FROM class_offers WHERE id IN (:O)', { O }); // cascades beneficiaries
  await run('DELETE FROM class_cohorts WHERE id IN (:K)', { K }); // cascades members
  await run('DELETE FROM conversations WHERE id IN (:C)', { C }); // cascades participants
  await run('UPDATE class_package_templates SET currentVersionId = NULL WHERE teacherId IN (:T)', { T });
  await run(
    `DELETE FROM class_package_template_versions WHERE templateId IN (SELECT id FROM (SELECT id FROM class_package_templates WHERE teacherId IN (:T)) own)`,
    { T });
  await run('DELETE FROM class_package_templates WHERE teacherId IN (:T)', { T });
  await run('DELETE FROM legal_acceptances WHERE userId IN (:T)', { T });
  // external_connections and teacher_class_settings cascade with the user; audit_logs keep the entry (actorId SET NULL).
}

module.exports = { collect, realUsersIn, remove };
