// Classes/chat data of test accounts, for adminUsers.deleteTestUsers (CONTRACT-05, CONTRATO.md §13).
// Collects every conversation, cohort, offer, order, purchase and session a test account takes part in. If any of them
// involves a real user, nothing may be deleted: those messages and commercial records are not ours to remove.
const { QueryTypes } = require('sequelize');

const sequelize = require('../config/database');

const select = (sql, replacements, transaction) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT, transaction });
const ids = rows => [...new Set(rows.map(row => row.id))];
const IN = list => (list.length ? list : [0]); // MySQL rejects IN ()

/** Ids of the class/chat aggregates a set of users takes part in. */
async function collect(userIds, transaction) {
  const T = IN(userIds);
  const conversations = ids(await select('SELECT id FROM conversations WHERE teacherId IN (:T) OR studentId IN (:T)', { T }, transaction));
  const cohorts = ids(await select(
    'SELECT id FROM class_cohorts WHERE teacherId IN (:T) UNION SELECT cohortId AS id FROM class_cohort_members WHERE userId IN (:T)', { T }, transaction));
  const offers = ids(await select(
    `SELECT id FROM class_offers WHERE teacherId IN (:T) OR buyerId IN (:T) OR conversationId IN (:C) OR cohortId IN (:K)
     UNION SELECT offerId AS id FROM class_offer_beneficiaries WHERE userId IN (:T)`,
    { T, C: IN(conversations), K: IN(cohorts) }, transaction));
  const orders = ids(await select('SELECT id FROM class_package_orders WHERE buyerId IN (:T) OR offerId IN (:O)', { T, O: IN(offers) }, transaction));
  const purchases = ids(await select(
    `SELECT id FROM class_package_purchases WHERE teacherId IN (:T) OR buyerId IN (:T) OR orderId IN (:R) OR offerId IN (:O)
     UNION SELECT purchaseId AS id FROM class_package_beneficiaries WHERE userId IN (:T)`,
    { T, R: IN(orders), O: IN(offers) }, transaction));
  const sessions = ids(await select(
    `SELECT id FROM class_sessions WHERE teacherId IN (:T) OR cohortId IN (:K)
     UNION SELECT sessionId AS id FROM class_session_participants WHERE userId IN (:T) OR purchaseId IN (:P)`,
    { T, K: IN(cohorts), P: IN(purchases) }, transaction));
  return { conversations, cohorts, offers, orders, purchases, sessions };
}

/** How many real (non-test) users take part in those aggregates. */
async function realUsersIn(scope, transaction) {
  const { conversations: C, cohorts: K, offers: O, orders: R, purchases: P, sessions: S } = Object.fromEntries(
    Object.entries(scope).map(([key, list]) => [key, IN(list)]));
  const [{ total }] = await select(
    `SELECT COUNT(*) AS total FROM (
       SELECT teacherId AS userId FROM conversations WHERE id IN (:C) UNION SELECT studentId FROM conversations WHERE id IN (:C)
       UNION SELECT senderId FROM messages WHERE conversationId IN (:C) AND senderId IS NOT NULL
       UNION SELECT teacherId FROM class_cohorts WHERE id IN (:K) UNION SELECT userId FROM class_cohort_members WHERE cohortId IN (:K)
       UNION SELECT teacherId FROM class_offers WHERE id IN (:O) UNION SELECT buyerId FROM class_offers WHERE id IN (:O)
       UNION SELECT userId FROM class_offer_beneficiaries WHERE offerId IN (:O)
       UNION SELECT buyerId FROM class_package_orders WHERE id IN (:R)
       UNION SELECT teacherId FROM class_package_purchases WHERE id IN (:P) UNION SELECT buyerId FROM class_package_purchases WHERE id IN (:P)
       UNION SELECT userId FROM class_package_beneficiaries WHERE purchaseId IN (:P)
       UNION SELECT teacherId FROM class_sessions WHERE id IN (:S) UNION SELECT userId FROM class_session_participants WHERE sessionId IN (:S)
     ) involved JOIN users ON users.id = involved.userId WHERE users.isTestAccount = 0`,
    { C, K, O, R, P, S }, transaction);
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
