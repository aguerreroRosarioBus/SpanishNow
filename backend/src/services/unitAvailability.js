// Drip content: when a unit opens for a student. THE rule lives here; every endpoint that serves unit content to a student
// calls assertUnitOpen (or unitAvailability) instead of re-implementing it.
//
//   releaseAfterDays  days after the student's enrolment (exact elapsed time: enrollment.createdAt + N x 24 h)
//   releaseAt         calendar date 'YYYY-MM-DD': opens at 00:00 UTC of that day (an ISO input is reduced to its UTC date)
//   both              the unit opens when BOTH are met (the later of the two)
//   neither           always open
// All instants are UTC. The teacher of the course is never locked. Course-level material and the welcome video are not
// unit content: they never go through here.
const { Enrollment } = require('../models');

const DAY_MS = 86400000;
const MAX_RELEASE_DAYS = 3650;
const MIN_YEAR = 2000;
const MAX_YEAR = 2200;

class ContentLockedError extends Error {
  /** `availableAt`: Date when the unit opens, or null when it cannot be known. */
  constructor(availableAt) {
    super('This content is not available yet');
    this.status = 403;
    this.code = 'content_locked';
    this.availableAt = availableAt ? availableAt.toISOString() : null;
  }
}

/**
 * State of `unit` for the student of `enrollment` at `now`: { locked, availableAt }.
 * `availableAt` is the Date the unit opens while locked, null when it is open (or, locked, when it cannot be computed: a
 * days rule without an enrolment fails closed).
 */
function unitAvailability(unit, enrollment, now = new Date()) {
  const candidates = [];
  if (unit.releaseAfterDays !== null && unit.releaseAfterDays !== undefined) {
    if (!enrollment || !enrollment.createdAt) return { locked: true, availableAt: null };
    candidates.push(new Date(enrollment.createdAt).getTime() + Number(unit.releaseAfterDays) * DAY_MS);
  }
  if (unit.releaseAt) candidates.push(new Date(unit.releaseAt).getTime());
  if (!candidates.length) return { locked: false, availableAt: null };
  const opensAt = Math.max(...candidates);
  const locked = now.getTime() < opensAt;
  return { locked, availableAt: locked ? new Date(opensAt) : null };
}

/** True for the teacher of the course: no lock applies. The callers only reach this after checking read access to the course. */
const isExempt = user => Boolean(user) && user.role === 'teacher';

/**
 * Throws ContentLockedError when `unit` is still closed for `user`. Teachers pass. A student's enrolment is looked up
 * unless the caller already has it (`enrollment`). The caller has already checked that the user may read the course.
 */
async function assertUnitOpen(user, unit, { enrollment, now } = {}) {
  if (isExempt(user)) return;
  const own = enrollment || await Enrollment.findOne({ where: { studentId: user.id, courseId: unit.courseId } });
  const state = unitAvailability(unit, own, now);
  if (state.locked) throw new ContentLockedError(state.availableAt);
}

/** Sends the 403 of a locked unit: { error, code: 'content_locked', availableAt }. */
const sendLocked = (res, error) => res.status(403).json({ error: error.message, code: error.code, availableAt: error.availableAt });

/** { locked, availableAt: ISO | null } as the course payload shows it. */
const present = state => ({ locked: state.locked, availableAt: state.availableAt ? state.availableAt.toISOString() : null });

const isWhole = value => (typeof value === 'number' ? Number.isInteger(value) : /^-?\d+$/.test(String(value).trim()));
const isBlank = value => value === null || (typeof value === 'string' && value.trim() === '');

/**
 * Release fields of a unit body (PUT/POST /units). A field that is absent is left alone, null (or blank) removes it.
 * Returns { values } (only the fields sent) or { error }.
 */
function parseReleaseFields(body = {}) {
  const values = {};
  if (body.releaseAfterDays !== undefined) {
    if (isBlank(body.releaseAfterDays)) values.releaseAfterDays = null;
    else {
      const days = isWhole(body.releaseAfterDays) ? Number(String(body.releaseAfterDays).trim()) : NaN;
      if (!Number.isInteger(days) || days < 0 || days > MAX_RELEASE_DAYS) return { error: `releaseAfterDays must be a whole number between 0 and ${MAX_RELEASE_DAYS}` };
      values.releaseAfterDays = days;
    }
  }
  if (body.releaseAt !== undefined) {
    if (isBlank(body.releaseAt)) values.releaseAt = null;
    else {
      const text = String(body.releaseAt).trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : new Date(text);
      if (typeof body.releaseAt === 'object' || Number.isNaN(date.getTime()) || date.getUTCFullYear() < MIN_YEAR || date.getUTCFullYear() > MAX_YEAR) {
        return { error: `releaseAt must be a date (YYYY-MM-DD or ISO) between ${MIN_YEAR} and ${MAX_YEAR}` };
      }
      values.releaseAt = date.toISOString().slice(0, 10); // stored and returned as 'YYYY-MM-DD'
    }
  }
  return { values };
}

module.exports = { ContentLockedError, unitAvailability, assertUnitOpen, sendLocked, present, parseReleaseFields, isExempt, MAX_RELEASE_DAYS, DAY_MS };
