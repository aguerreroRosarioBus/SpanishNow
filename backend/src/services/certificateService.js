// Certificates of completion.
// Eligible when the student finished the narration of every story that has a published lesson AND passed every published unit quiz.
// A course with nothing to complete never gives a certificate. Issuing is idempotent: one certificate per enrolment.
const { randomInt } = require('crypto');
const { Op, UniqueConstraintError } = require('sequelize');
const PDFDocument = require('pdfkit');
const { Story, Unit, LessonPlan, LessonProgress, UnitQuiz, Certificate, Course, User } = require('../models');
const { bestScores } = require('./quizService');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_GROUPS = 3;
const CODE_GROUP_LENGTH = 4;
const MAX_NAME = 100;
const COLORS = { wine: '#3d1420', coral: '#e8573a', cream: '#fbf3e4', muted: '#7a5a60' };

/** Random code like "K7QM-X2PD-9TNA" (14 characters). */
function generateCode() {
  const groups = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    let group = '';
    for (let i = 0; i < CODE_GROUP_LENGTH; i++) group += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}

/** Canonical form of a code typed or pasted by a person (case, spaces and hyphens do not matter); null when it cannot be one. */
function normalizeCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== CODE_GROUPS * CODE_GROUP_LENGTH || ![...raw].every(c => CODE_ALPHABET.includes(c))) return null;
  return raw.match(new RegExp(`.{${CODE_GROUP_LENGTH}}`, 'g')).join('-');
}

/**
 * What an enrolment still needs for the certificate.
 * Returns { stories: { total, completed }, quizzes: [{ unitId, quizId, bestScore, passed }], missing: { stories, quizzes }, eligible }.
 */
async function completionOf(enrollment) {
  const stories = await Story.findAll({ attributes: ['id'], include: [{ model: Unit, as: 'unit', attributes: [], where: { courseId: enrollment.courseId } }], raw: true });
  const storyIds = stories.map(s => s.id);
  const published = storyIds.length
    ? await LessonPlan.findAll({ where: { storyId: { [Op.in]: storyIds }, status: 'published' }, attributes: ['storyId'], raw: true })
    : [];
  const required = [...new Set(published.map(p => p.storyId))];
  const done = required.length
    ? await LessonProgress.findAll({ where: { enrollmentId: enrollment.id, storyId: { [Op.in]: required }, narrativeCompleted: true }, attributes: ['storyId'], raw: true })
    : [];
  const completed = new Set(done.map(row => row.storyId)).size;

  const quizzes = await UnitQuiz.findAll({
    where: { isPublished: true }, attributes: ['id', 'unitId', 'passingScore'],
    include: [{ model: Unit, as: 'unit', attributes: [], where: { courseId: enrollment.courseId } }],
    order: [[{ model: Unit, as: 'unit' }, 'order', 'ASC'], [{ model: Unit, as: 'unit' }, 'id', 'ASC']]
  });
  const best = await bestScores(enrollment.id, quizzes.map(q => q.id));
  const quizProgress = quizzes.map(q => {
    const bestScore = best.has(q.id) ? best.get(q.id) : null;
    return { unitId: q.unitId, quizId: q.id, bestScore, passed: bestScore !== null && bestScore >= q.passingScore };
  });

  const missing = { stories: required.length - completed, quizzes: quizProgress.filter(q => !q.passed).length };
  const eligible = (required.length > 0 || quizzes.length > 0) && missing.stories === 0 && missing.quizzes === 0;
  return { stories: { total: required.length, completed }, quizzes: quizProgress, missing, eligible };
}

/** Certificate part of GET /enrollments/:id/progress. */
async function statusOf(enrollment, completion) {
  const certificate = await Certificate.findOne({ where: { enrollmentId: enrollment.id }, attributes: ['code'] });
  return { eligible: completion.eligible, code: certificate ? certificate.code : null, missing: completion.missing };
}

/** Name to print: the one given (trimmed, single-spaced, at most 100 characters) or the account name. Returns { name } or { error }. */
function cleanName(input, fallback) {
  if (input === undefined || input === null || (typeof input === 'string' && input.trim() === '')) return { name: String(fallback || '').trim().slice(0, MAX_NAME) };
  if (typeof input !== 'string') return { error: 'name must be text' };
  const name = input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return { name: String(fallback || '').trim().slice(0, MAX_NAME) };
  if (name.length > MAX_NAME) return { error: `name must have at most ${MAX_NAME} characters` };
  return { name };
}

const publicShape = certificate => ({
  code: certificate.code,
  studentName: certificate.studentName,
  courseTitle: certificate.courseTitle,
  teacherName: certificate.teacherName,
  issuedAt: certificate.issuedAt
});

/**
 * Issues the certificate of an eligible enrolment, or returns the existing one (idempotent).
 * Returns { certificate, created } or { missing } when the enrolment is not eligible yet.
 * A name given again for an already issued certificate corrects the printed name; the code never changes.
 */
async function issue(enrollment, { name } = {}) {
  const existing = await Certificate.findOne({ where: { enrollmentId: enrollment.id } });
  const student = await User.findByPk(enrollment.studentId, { attributes: ['id', 'name'] });
  if (existing) {
    if (name !== undefined && name !== null && String(name).trim() !== '') {
      const cleaned = cleanName(name, student.name);
      if (cleaned.name && cleaned.name !== existing.studentName) await existing.update({ studentName: cleaned.name });
    }
    return { certificate: existing, created: false };
  }
  const completion = await completionOf(enrollment);
  if (!completion.eligible) return { missing: completion.missing };

  const course = await Course.findByPk(enrollment.courseId, { include: [{ model: User, as: 'teacher', attributes: ['name'] }] });
  const values = {
    enrollmentId: enrollment.id,
    studentName: cleanName(name, student.name).name,
    courseTitle: course.title,
    teacherName: course.teacher ? course.teacher.name : '',
    issuedAt: new Date(Math.floor(Date.now() / 1000) * 1000) // the column keeps seconds: the response matches what is stored
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return { certificate: await Certificate.create({ ...values, code: generateCode() }), created: true };
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const raced = await Certificate.findOne({ where: { enrollmentId: enrollment.id } }); // another request issued it first
      if (raced) return { certificate: raced, created: false };
    }
  }
  throw new Error('Could not generate a unique certificate code');
}

// ---- PDF -------------------------------------------------------------------------------------------------------------
// The standard PDF fonts cover Windows-1252 (Spanish, French, Portuguese, German...). Other characters lose their marks when
// they can (ł -> l), and become "?" otherwise, so a name never breaks the file.
const NO_DECOMPOSITION = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŧ': 'T', 'ŧ': 't' };
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function pdfSafe(text) {
  let out = '';
  for (const ch of String(text).normalize('NFC')) {
    const code = ch.codePointAt(0);
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(ch)) { out += ch; continue; }
    const base = NO_DECOMPOSITION[ch] || ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += /^[\x20-\x7e]+$/.test(base) ? base : '?';
  }
  return out.replace(/\s+/g, ' ').trim();
}

const verifyUrl = code => `${(process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/+$/, '')}/certificates/${code}`;
const longDate = date => new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** A4 landscape certificate in English, brand colors. Resolves a Buffer. `compress: false` is for tests. */
function renderPdf(certificate, { compress = true } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: 0, compress,
      info: { Title: `Certificate of Completion - ${pdfSafe(certificate.courseTitle)}`, Author: 'SpanishNow' }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width; const H = doc.page.height;
    const left = 90; const inner = W - left * 2;
    const centered = (text, y, font, size, color, options = {}) => {
      doc.font(font).fontSize(size).fillColor(color).text(text, left, y, { width: inner, align: 'center', lineBreak: true, ...options });
    };
    // Shrinks the text until it fits `lines` lines of `inner` width.
    const fitSize = (text, font, start, min, lines) => {
      let size = start;
      doc.font(font);
      while (size > min && doc.fontSize(size).heightOfString(text, { width: inner }) > size * 1.25 * lines) size -= 1;
      return size;
    };

    doc.rect(0, 0, W, H).fill(COLORS.cream);
    doc.lineWidth(8).strokeColor(COLORS.wine).rect(22, 22, W - 44, H - 44).stroke();
    doc.lineWidth(1.2).strokeColor(COLORS.coral).rect(36, 36, W - 72, H - 72).stroke();

    centered('SPANISHNOW', 70, 'Helvetica-Bold', 13, COLORS.coral, { characterSpacing: 5 });
    centered('Certificate of Completion', 98, 'Times-Bold', 44, COLORS.wine);
    doc.rect(W / 2 - 40, 160, 80, 3).fill(COLORS.coral);

    centered('This certifies that', 190, 'Helvetica', 15, COLORS.muted);
    const name = pdfSafe(certificate.studentName);
    centered(name, 218, 'Times-Italic', fitSize(name, 'Times-Italic', 48, 22, 1), COLORS.wine, { lineBreak: false });
    doc.lineWidth(0.8).strokeColor(COLORS.coral).moveTo(W / 2 - 200, 285).lineTo(W / 2 + 200, 285).stroke();

    centered('has successfully completed the course', 305, 'Helvetica', 15, COLORS.muted);
    const title = pdfSafe(certificate.courseTitle);
    centered(title, 335, 'Helvetica-Bold', fitSize(title, 'Helvetica-Bold', 28, 16, 2), COLORS.wine);
    centered(`taught by ${pdfSafe(certificate.teacherName)}`, 410, 'Helvetica', 16, COLORS.muted);

    doc.lineWidth(0.8).strokeColor(COLORS.wine).moveTo(left, 470).lineTo(W - left, 470).stroke();
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted)
      .text('Issued on', left, 482, { width: 200, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.wine)
      .text(longDate(certificate.issuedAt), left, 497, { width: 260, lineBreak: false });
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted)
      .text('Certificate code', W - left - 300, 482, { width: 300, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.wine)
      .text(certificate.code, W - left - 300, 497, { width: 300, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
      .text(`Verify at ${verifyUrl(certificate.code)}`, left, 530, { width: inner, align: 'center', lineBreak: false });

    doc.end();
  });
}

module.exports = { generateCode, normalizeCode, completionOf, statusOf, cleanName, publicShape, issue, renderPdf, pdfSafe, verifyUrl, MAX_NAME };
