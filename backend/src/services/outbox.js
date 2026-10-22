// Durable jobs (CONTRACT-03/04, CONTRATO.md §8). enqueue() is called inside the business transaction, so the job exists
// only if that state was committed. Workers claim one job at a time with SELECT ... FOR UPDATE SKIP LOCKED and an
// ownership token, renew the lease while the handler runs and settle the job only if they still own it: several live
// replicas never run the same job at once, and a job whose worker died is claimed again once its lease expires. Handlers
// run outside any transaction and must be idempotent (a job may run twice if the process dies between the effect and
// marking it done); before an external effect they can call ctx.stillOwned().
const os = require('os');
const { randomUUID } = require('crypto');
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

/** Claims the next due job for `token` (one job per claim, so a long handler never holds other jobs' leases). */
async function claimOne({ token, leaseMs, clock }) {
  return sequelize.transaction(async transaction => {
    const now = clock();
    const job = await OutboxJob.findOne({
      where: {
        [Op.or]: [
          { status: 'pending', runAt: { [Op.lte]: now } },
          { status: 'running', lockedUntil: { [Op.lt]: now } }
        ]
      },
      order: [['runAt', 'ASC'], ['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true
    });
    if (!job) return null;
    const lockedUntil = new Date(now.getTime() + leaseMs);
    await OutboxJob.update({ status: 'running', lockedBy: token, lockedUntil }, { where: { id: job.id }, transaction });
    return Object.assign(job, { status: 'running', lockedBy: token, lockedUntil });
  });
}

/**
 * Keeps the lease of a running job alive every leaseMs / 3 while its handler runs. If the row no longer belongs to this
 * token (another worker took it after an expiry), `lost` turns true and the job is not settled by this worker.
 */
function keepLease({ job, token, leaseMs, clock }) {
  const owned = { id: job.id, lockedBy: token, status: 'running' };
  const state = { lost: false, stopped: false };
  let timeout = null;
  const beat = async () => {
    if (state.stopped) return;
    try {
      await OutboxJob.update({ lockedUntil: new Date(clock().getTime() + leaseMs) }, { where: owned });
      // Checked by query, not by affected rows: MySQL reports 0 when the new value equals the old one.
      if (!(await OutboxJob.count({ where: owned }))) state.lost = true;
    } catch (error) {
      console.error('Outbox lease renewal:', sanitize(error));
    }
    if (!state.stopped && !state.lost) timeout = setTimeout(beat, Math.max(Math.floor(leaseMs / 3), 10));
  };
  timeout = setTimeout(beat, Math.max(Math.floor(leaseMs / 3), 10));
  return {
    state,
    /** For handlers: true while this worker still owns the job (checked in the database). Call it before an effect. */
    stillOwned: async () => !state.lost && Boolean(await OutboxJob.count({ where: owned })),
    stop: () => { state.stopped = true; clearTimeout(timeout); }
  };
}

/**
 * Runs up to `limit` due jobs, claiming them one at a time. Returns { claimed, done, retried, failed, lost }.
 * Each claim gets its own ownership token (lockedBy); the job is settled only while that token still owns it.
 * `now` shifts this worker's clock (tests); `leaseMs` is how long a claim lasts without renewal.
 */
async function runOnce({ workerId = DEFAULT_WORKER, limit = 20, now = null, leaseMs = LOCK_MS } = {}) {
  const offset = now ? now.getTime() - Date.now() : 0;
  const clock = () => new Date(Date.now() + offset);
  const result = { claimed: 0, done: 0, retried: 0, failed: 0, lost: 0 };
  for (let i = 0; i < limit; i += 1) {
    const token = `${String(workerId).slice(0, 52)}:${randomUUID().slice(0, 8)}`;
    const job = await claimOne({ token, leaseMs, clock });
    if (!job) break;
    result.claimed += 1;
    const lease = keepLease({ job, token, leaseMs, clock });
    const owned = { id: job.id, lockedBy: token, status: 'running' };
    let changes;
    try {
      const handler = handlers.get(job.topic);
      if (!handler) throw new Error(`No handler for topic ${job.topic}`);
      await handler(job, { stillOwned: lease.stillOwned });
      changes = { status: 'done', doneAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null };
    } catch (error) {
      const attempts = job.attempts + 1;
      const failed = attempts >= job.maxAttempts;
      changes = {
        status: failed ? 'failed' : 'pending', attempts, lastError: sanitize(error), lockedBy: null, lockedUntil: null,
        ...(failed ? {} : { runAt: new Date(clock().getTime() + backoff(attempts)) })
      };
    } finally {
      lease.stop();
    }
    const [count] = await OutboxJob.update(changes, { where: owned });
    if (!count) result.lost += 1;
    else if (changes.status === 'done') result.done += 1;
    else result[changes.status === 'failed' ? 'failed' : 'retried'] += 1;
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
