// Durable jobs (CONTRACT-03/04, CONTRATO.md §8). enqueue() is called inside the business transaction, so the job exists
// only if that state was committed. Workers claim jobs with SELECT ... FOR UPDATE SKIP LOCKED: several replicas never run
// the same job at once, and a job whose worker died is claimed again once its lock expires. Handlers run outside any
// transaction and must be idempotent (a job may run twice if the process dies between the effect and marking it done).
const os = require('os');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { OutboxJob } = require('../models');

const handlers = new Map();
const LOCK_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const DEFAULT_WORKER = `${os.hostname()}:${process.pid}`.slice(0, 64);

/** Registers the handler of a topic: async (job) => void. Throwing schedules a retry. */
function register(topic, handler) {
  if (handlers.has(topic)) throw new Error(`Outbox topic ${topic} already has a handler`);
  handlers.set(topic, handler);
}

const unregisterAll = () => handlers.clear(); // tests only

/**
 * Adds a job, or returns the existing one with the same dedupeKey (never a second one). `transaction` should be the
 * business transaction. Returns { job, created }.
 */
async function enqueue({ topic, dedupeKey, payload = null, runAt = new Date(), aggregateType = null, aggregateId = null, aggregateVersion = null, maxAttempts = 8 }, { transaction } = {}) {
  if (!topic || !dedupeKey) throw new Error('outbox.enqueue needs topic and dedupeKey');
  const [job, created] = await OutboxJob.findOrCreate({
    where: { dedupeKey },
    defaults: { topic, dedupeKey, payload, runAt, aggregateType, aggregateId, aggregateVersion, maxAttempts, status: 'pending' },
    transaction
  });
  return { job, created };
}

/**
 * Cancels pending jobs of an aggregate (e.g. reminders of an older session version). Returns how many.
 * `beforeVersion`: only jobs whose aggregateVersion is lower. `topicPrefix`: only topics starting with it.
 */
async function cancel({ aggregateType, aggregateId, topicPrefix = null, beforeVersion = null }, { transaction } = {}) {
  const where = { aggregateType, aggregateId, status: 'pending' };
  if (topicPrefix) where.topic = { [Op.startsWith]: topicPrefix };
  if (beforeVersion !== null) where.aggregateVersion = { [Op.lt]: beforeVersion };
  const [count] = await OutboxJob.update({ status: 'cancelled' }, { where, transaction });
  return count;
}

// Never store tokens, URLs with secrets or long provider bodies in lastError.
function sanitize(error) {
  return String((error && error.message) || error || 'error')
    .replace(/(bearer\s+|token[=:]\s*|access_token=|refresh_token=|pwd=|password=)[^\s&"']+/gi, '$1[redacted]')
    .replace(/https?:\/\/\S+/g, '[url]')
    .slice(0, 500);
}

const backoff = attempts => Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_MS);

/** Claims up to `limit` due jobs for this worker, in one short transaction. */
async function claim({ workerId, limit, now }) {
  return sequelize.transaction(async transaction => {
    const due = await OutboxJob.findAll({
      where: {
        [Op.or]: [
          { status: 'pending', runAt: { [Op.lte]: now } },
          { status: 'running', lockedUntil: { [Op.lt]: now } }
        ]
      },
      order: [['runAt', 'ASC'], ['id', 'ASC']],
      limit,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true
    });
    if (!due.length) return [];
    const lockedUntil = new Date(now.getTime() + LOCK_MS);
    await OutboxJob.update({ status: 'running', lockedBy: workerId, lockedUntil }, { where: { id: due.map(job => job.id) }, transaction });
    return due.map(job => Object.assign(job, { status: 'running', lockedBy: workerId, lockedUntil }));
  });
}

/** Runs one batch. Returns { claimed, done, retried, failed }. */
async function runOnce({ workerId = DEFAULT_WORKER, limit = 20, now = new Date() } = {}) {
  const jobs = await claim({ workerId, limit, now });
  const result = { claimed: jobs.length, done: 0, retried: 0, failed: 0 };
  for (const job of jobs) {
    const handler = handlers.get(job.topic);
    // Only the worker that holds the lock may settle the job.
    const mine = { id: job.id, status: 'running', lockedBy: workerId };
    try {
      if (!handler) throw new Error(`No handler for topic ${job.topic}`);
      await handler(job);
      await OutboxJob.update({ status: 'done', doneAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null }, { where: mine });
      result.done += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const failed = attempts >= job.maxAttempts;
      await OutboxJob.update({
        status: failed ? 'failed' : 'pending', attempts, lastError: sanitize(error), lockedBy: null, lockedUntil: null,
        ...(failed ? {} : { runAt: new Date(Date.now() + backoff(attempts)) })
      }, { where: mine });
      result[failed ? 'failed' : 'retried'] += 1;
    }
  }
  return result;
}

let timer = null;
let running = false;

/** Polls for due jobs while OUTBOX_WORKER=1. The timer only triggers polling; durability comes from the table. */
function start({ intervalMs = 5000, workerId = DEFAULT_WORKER } = {}) {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await runOnce({ workerId }); } catch (error) { console.error('Outbox worker:', sanitize(error)); } finally { running = false; }
  }, intervalMs);
  timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { register, unregisterAll, enqueue, cancel, runOnce, start, stop, sanitize, backoff };
