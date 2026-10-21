// CSV import of Hotmart buyers (and the shared logic of manual enrolment).
const { parse } = require('csv-parse/sync');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { User, Enrollment } = require('../models');
const { normalizeEmail, isValidEmail, cleanName, findOrCreateStudent } = require('./accounts');
const { createToken, hasPendingInvite } = require('./passwordTokens');
const { sendMail } = require('./mailService');
const templates = require('./emailTemplates');

const MAX_ROWS = 5000;
const MAX_BYTES = 2 * 1024 * 1024;
const BACKGROUND_INVITES_OVER = 50; // more invitations than this are sent after the response
const INVITE_CONCURRENCY = 5;

class ImportError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Header names (Hotmart exports in the language of the account). Compared after normalizing: lowercase, no accents,
// only letters and digits ("E-mail" -> "email", "Nombre del comprador" -> "nombredelcomprador").
const NAME_HEADERS = ['buyername', 'nombredelcomprador', 'nomedocomprador', 'name', 'nombre', 'nome', 'fullname', 'nombrecompleto'];
const EMAIL_HEADERS = ['buyeremail', 'emaildelcomprador', 'emaildocomprador', 'email', 'correo', 'correoelectronico'];
const normalizeHeader = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** UTF-8 (BOM tolerated); falls back to Windows-1252 when the bytes are not valid UTF-8 (Excel exports). */
function decode(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (error) { text = new TextDecoder('windows-1252').decode(buffer); }
  return text.replace(/^﻿/, '');
}

/** `,` or `;` (or tab): whichever appears most in the header line outside quotes; `,` on a tie. */
function detectDelimiter(text) {
  const header = text.split(/\r\n|\n|\r/).find(line => line.trim()) || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const char of header) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char]++;
  }
  return Object.keys(counts).reduce((best, key) => (counts[key] > counts[best] ? key : best), ',');
}

/**
 * Reads the file into [{ line, name, email, error? }] with emails normalized and duplicates removed.
 * Throws ImportError for an unusable file (too big, not CSV, no email column, too many rows).
 */
function parseCsv(buffer) {
  if (!buffer || !buffer.length) throw new ImportError(400, 'The file is empty');
  if (buffer.length > MAX_BYTES) throw new ImportError(413, 'The file is larger than 2 MB');
  const text = decode(buffer);
  let records;
  try {
    records = parse(text, {
      delimiter: detectDelimiter(text), bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true,
      trim: true, info: true
    });
  } catch (error) {
    throw new ImportError(400, `The file is not a valid CSV: ${error.message}`);
  }
  if (!records.length) throw new ImportError(400, 'The file is empty');

  const headers = records[0].record.map(normalizeHeader);
  const emailIndex = headers.findIndex(h => EMAIL_HEADERS.includes(h));
  if (emailIndex === -1) throw new ImportError(400, 'No email column found. Expected a header such as Email, E-mail, Buyer email, Email del comprador or Email do comprador.');
  const nameIndex = headers.findIndex((h, i) => i !== emailIndex && NAME_HEADERS.includes(h));

  const data = records.slice(1);
  if (data.length > MAX_ROWS) throw new ImportError(400, `The file has more than ${MAX_ROWS} rows`);

  const rows = [];
  const seen = new Set();
  let duplicates = 0;
  for (const { record, info } of data) {
    if (!record.some(cell => String(cell).trim())) continue;
    const email = normalizeEmail(record[emailIndex]);
    const name = cleanName(nameIndex === -1 ? '' : record[nameIndex], email || 'student');
    // csv-parse counts lines read so far; with multi-line cells the record ends on that line, which is what a user sees in Excel for single-line rows.
    const line = info.lines;
    if (!email) { rows.push({ line, name: nameIndex === -1 ? '' : name, email: '', error: 'Missing email' }); continue; }
    if (!isValidEmail(email)) { rows.push({ line, name, email, error: 'Invalid email address' }); continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    rows.push({ line, name, email });
  }
  return { rows, duplicates };
}

/** Classifies each parsed row against the database. Writes nothing. */
async function classify(courseId, parsed) {
  const emails = parsed.rows.filter(r => !r.error).map(r => r.email);
  const users = new Map();
  for (let i = 0; i < emails.length; i += 500) {
    const found = await User.findAll({ where: { email: { [Op.in]: emails.slice(i, i + 500) } } });
    found.forEach(user => users.set(normalizeEmail(user.email), user));
  }
  const enrolled = new Set();
  const userIds = [...users.values()].map(u => u.id);
  for (let i = 0; i < userIds.length; i += 500) {
    const found = await Enrollment.findAll({ where: { courseId, studentId: { [Op.in]: userIds.slice(i, i + 500) } }, attributes: ['studentId'] });
    found.forEach(e => enrolled.add(e.studentId));
  }

  const rows = parsed.rows.map(row => {
    const base = { line: row.line, name: row.name, email: row.email };
    if (row.error) return { ...base, status: 'invalid', reason: row.error };
    const user = users.get(row.email);
    if (!user) return { ...base, status: 'new' };
    if (user.role !== 'student') return { ...base, status: 'invalid', reason: 'This email belongs to a teacher account' };
    if (enrolled.has(user.id)) return { ...base, status: 'already_enrolled' };
    return { ...base, status: 'existing_user' };
  });
  const count = status => rows.filter(r => r.status === status).length;
  const summary = {
    total: rows.length, new: count('new'), existingUser: count('existing_user'), alreadyEnrolled: count('already_enrolled'),
    invalid: count('invalid'), duplicates: parsed.duplicates
  };
  return { rows, summary, users };
}

/** Dry run: what an import of this file would do. */
async function previewImport(courseId, buffer) {
  const { rows, summary } = await classify(courseId, parseCsv(buffer));
  return { rows, summary };
}

/**
 * Gives the person access to the course, creating the student if needed. Idempotent: an existing enrolment is kept.
 * Returns { user, enrollment, enrollmentCreated, userCreated }. Sending the invitation is up to the caller.
 */
async function grantAccess({ course, email, name, source }) {
  return sequelize.transaction(async transaction => {
    const { user, created: userCreated } = await findOrCreateStudent({ email, name }, { transaction });
    if (user.role !== 'student') throw new ImportError(400, 'This email belongs to a teacher account');
    const [enrollment, enrollmentCreated] = await Enrollment.findOrCreate({
      where: { studentId: user.id, courseId: course.id },
      defaults: { studentId: user.id, courseId: course.id, source },
      transaction
    });
    return { user, enrollment, enrollmentCreated, userCreated };
  });
}

/**
 * Builds and sends the invitation. Accounts created now, or created earlier and still without a chosen password,
 * get a set-password link; the rest a sign-in link.
 */
async function sendInvitation({ course, teacherName, user, userCreated = false }) {
  const needsPassword = userCreated || await hasPendingInvite(user.id);
  const inviteToken = needsPassword ? await createToken(user, 'invite') : null;
  await sendMail({
    to: user.email,
    ...templates.invitation({ name: user.name, course, teacherName, inviteToken, hasAccount: !needsPassword })
  });
}

async function runLimited(items, limit, worker) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

/**
 * Applies the import: creates students and enrollments (source 'hotmart_import') and, with `sendInvites`, emails them.
 * Returns { rows, summary, applied } with the classification the file had before applying.
 */
async function applyImport(course, buffer, { sendInvites }) {
  const parsed = parseCsv(buffer);
  const { rows, summary } = await classify(course.id, parsed);
  const teacher = await User.findByPk(course.teacherId, { attributes: ['name'] });
  const teacherName = teacher ? teacher.name.split(/\s+/)[0] : null;

  const todo = rows.filter(r => r.status === 'new' || r.status === 'existing_user');
  const granted = [];
  let failed = 0;
  for (const row of todo) {
    try {
      const result = await grantAccess({ course, email: row.email, name: row.name, source: 'hotmart_import' });
      if (result.enrollmentCreated) granted.push(result);
    } catch (error) {
      failed++;
      row.status = 'invalid';
      row.reason = error.message;
      console.error(`Import line ${row.line} failed:`, error.message);
    }
  }

  const applied = { users: granted.filter(g => g.userCreated).length, enrollments: granted.length, failed, invites: { requested: 0, sent: 0, failed: 0, background: false } };
  if (sendInvites && granted.length) {
    const send = async ({ user, userCreated }) => {
      try { await sendInvitation({ course, teacherName, user, userCreated }); return true; } catch (error) {
        console.error(`Invitation to ${user.email} failed:`, error.message);
        return false;
      }
    };
    applied.invites.requested = granted.length;
    if (granted.length > BACKGROUND_INVITES_OVER) {
      applied.invites.background = true;
      runLimited(granted, INVITE_CONCURRENCY, send).catch(error => console.error('Invitations failed:', error.message));
    } else {
      const results = await runLimited(granted, INVITE_CONCURRENCY, send);
      applied.invites.sent = results.filter(Boolean).length;
      applied.invites.failed = results.length - applied.invites.sent;
    }
  }
  if (failed) {
    Object.assign(summary, {
      invalid: rows.filter(r => r.status === 'invalid').length,
      new: rows.filter(r => r.status === 'new').length,
      existingUser: rows.filter(r => r.status === 'existing_user').length
    });
  }
  return { rows, summary, applied };
}

module.exports = {
  parseCsv, previewImport, applyImport, grantAccess, sendInvitation, ImportError, MAX_ROWS, MAX_BYTES
};
