// Unit quizzes: multiple choice, unlimited attempts, the best score counts, passing at `passingScore` (70 by default).
// A student never receives correctIndex or explanation before submitting an attempt: studentView() and summaryFor() are
// the only shapes sent to students, and they do not carry them.
const { Op, fn, col } = require('sequelize');
const sequelize = require('../config/database');
const { UnitQuiz, UnitQuizQuestion, UnitQuizAttempt } = require('../models');

const LIMITS = { title: 200, prompt: 2000, option: 500, explanation: 2000, minQuestions: 1, maxQuestions: 50, minOptions: 2, maxOptions: 6 };
const DEFAULT_PASSING_SCORE = 70;
const DEFAULT_TITLE = 'Quiz';

class QuizError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const validId = value => Number.isInteger(value) && value > 0 && value <= 2147483647;

/** Validates the body of PUT /units/:id/quiz. Returns { value } (normalised) or { error }. */
function parseQuizPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid quiz' };
  const title = body.title === undefined ? DEFAULT_TITLE : body.title;
  if (!isText(title, LIMITS.title)) return { error: `title is required (up to ${LIMITS.title} characters)` };
  const passingScore = body.passingScore === undefined ? DEFAULT_PASSING_SCORE : body.passingScore;
  if (!Number.isInteger(passingScore) || passingScore < 1 || passingScore > 100) return { error: 'passingScore must be a whole number between 1 and 100' };
  const isPublished = body.isPublished === undefined ? false : body.isPublished;
  if (typeof isPublished !== 'boolean') return { error: 'isPublished must be true or false' };
  const { questions } = body;
  if (!Array.isArray(questions) || questions.length < LIMITS.minQuestions || questions.length > LIMITS.maxQuestions) {
    return { error: `A quiz needs between ${LIMITS.minQuestions} and ${LIMITS.maxQuestions} questions` };
  }
  const parsed = [];
  const seenIds = new Set();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const label = `Question ${i + 1}`;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return { error: `${label}: invalid` };
    if (q.id !== undefined && q.id !== null) {
      if (!validId(q.id)) return { error: `${label}: invalid id` };
      if (seenIds.has(q.id)) return { error: `${label}: repeated id ${q.id}` };
      seenIds.add(q.id);
    }
    if (!isText(q.prompt, LIMITS.prompt)) return { error: `${label}: prompt is required (up to ${LIMITS.prompt} characters)` };
    if (!Array.isArray(q.options) || q.options.length < LIMITS.minOptions || q.options.length > LIMITS.maxOptions) {
      return { error: `${label}: between ${LIMITS.minOptions} and ${LIMITS.maxOptions} options are required` };
    }
    if (!q.options.every(option => isText(option, LIMITS.option))) return { error: `${label}: options cannot be empty (up to ${LIMITS.option} characters)` };
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) return { error: `${label}: correctIndex is out of range` };
    let explanation = null;
    if (q.explanation !== undefined && q.explanation !== null) {
      if (typeof q.explanation !== 'string' || q.explanation.length > LIMITS.explanation) return { error: `${label}: explanation must be text of up to ${LIMITS.explanation} characters` };
      explanation = q.explanation.trim() === '' ? null : q.explanation.trim();
    }
    parsed.push({ id: q.id ?? null, prompt: q.prompt.trim(), options: q.options.map(option => option.trim()), correctIndex: q.correctIndex, explanation });
  }
  return { value: { title: title.trim(), passingScore, isPublished, questions: parsed } };
}

/** Creates or replaces the quiz of a unit. Questions are synced by id: kept ones are updated, new ones created, missing ones deleted. */
async function saveQuiz(unitId, value) {
  return sequelize.transaction(async transaction => {
    let quiz = await UnitQuiz.findOne({ where: { unitId }, transaction, lock: transaction.LOCK.UPDATE });
    const fields = { title: value.title, passingScore: value.passingScore, isPublished: value.isPublished };
    if (quiz) await quiz.update(fields, { transaction });
    else quiz = await UnitQuiz.create({ unitId, ...fields }, { transaction });

    const existing = await UnitQuizQuestion.findAll({ where: { quizId: quiz.id }, transaction });
    const byId = new Map(existing.map(question => [question.id, question]));
    for (const q of value.questions) {
      if (q.id !== null && !byId.has(q.id)) throw new QuizError(`Question ${q.id} does not belong to this quiz`);
    }
    const keep = new Set(value.questions.filter(q => q.id !== null).map(q => q.id));
    const removed = existing.filter(question => !keep.has(question.id)).map(question => question.id);
    if (removed.length) await UnitQuizQuestion.destroy({ where: { id: removed }, transaction });
    for (const [order, q] of value.questions.entries()) {
      const values = { order, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation };
      if (q.id !== null) await byId.get(q.id).update(values, { transaction });
      else await UnitQuizQuestion.create({ quizId: quiz.id, ...values }, { transaction });
    }
    return quiz.id;
  });
}

const orderedQuestions = quizId => UnitQuizQuestion.findAll({ where: { quizId }, order: [['order', 'ASC'], ['id', 'ASC']] });

/** Full quiz for the course teacher (with the correct answers). */
async function teacherView(quiz) {
  const questions = await orderedQuestions(quiz.id);
  return {
    id: quiz.id, unitId: quiz.unitId, title: quiz.title, passingScore: quiz.passingScore, isPublished: quiz.isPublished,
    questions: questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation }))
  };
}

/** Best score per quiz of one enrolment: Map(quizId -> score). Quizzes without attempts are absent. */
async function bestScores(enrollmentId, quizIds) {
  if (!quizIds.length) return new Map();
  const rows = await UnitQuizAttempt.findAll({
    where: { enrollmentId, quizId: { [Op.in]: quizIds } },
    attributes: ['quizId', [fn('MAX', col('score')), 'best']], group: ['quizId'], raw: true
  });
  return new Map(rows.map(row => [row.quizId, Number(row.best)]));
}

/** The quiz as a student sees it: no correct answers, no explanations. */
async function studentView(quiz, enrollmentId) {
  const questions = await orderedQuestions(quiz.id);
  const best = enrollmentId ? (await bestScores(enrollmentId, [quiz.id])).get(quiz.id) : undefined;
  return {
    id: quiz.id, title: quiz.title, passingScore: quiz.passingScore,
    questions: questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options })),
    // "passed" follows the current passing score, so editing it also applies to attempts already made.
    bestAttempt: best === undefined ? null : { score: best, passed: best >= quiz.passingScore }
  };
}

/** Scores the answers against the questions. `answers` has one option index (or null) per question. */
function grade(questions, answers) {
  const results = questions.map((q, i) => ({
    questionId: q.id, correct: answers[i] === q.correctIndex, correctIndex: q.correctIndex, explanation: q.explanation
  }));
  const correct = results.filter(result => result.correct).length;
  return { results, score: questions.length ? Math.round((correct / questions.length) * 100) : 0 };
}

/** Validates the body of POST /units/:id/quiz/attempts against the quiz questions. Returns { answers } or { error }. */
function parseAnswers(body, questions) {
  const answers = body ? body.answers : undefined;
  if (!Array.isArray(answers) || answers.length !== questions.length) return { error: `answers must have one entry per question (${questions.length})` };
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (a === null) continue; // left blank: counts as incorrect
    if (!Number.isInteger(a) || a < 0 || a >= questions[i].options.length) return { error: `answers[${i}] is not a valid option` };
  }
  return { answers };
}

/** Published quizzes of some units: Map(unitId -> { id, title, questionCount, passingScore, isPublished }). `includeDrafts` for the course teacher. */
async function summariesByUnit(unitIds, { includeDrafts = false } = {}) {
  if (!unitIds.length) return new Map();
  const quizzes = await UnitQuiz.findAll({ where: { unitId: { [Op.in]: unitIds }, ...(includeDrafts ? {} : { isPublished: true }) } });
  if (!quizzes.length) return new Map();
  const counts = await UnitQuizQuestion.findAll({
    where: { quizId: { [Op.in]: quizzes.map(q => q.id) } }, attributes: ['quizId', [fn('COUNT', col('id')), 'total']], group: ['quizId'], raw: true
  });
  const totals = new Map(counts.map(row => [row.quizId, Number(row.total)]));
  return new Map(quizzes.map(q => [q.unitId, { id: q.id, title: q.title, questionCount: totals.get(q.id) || 0, passingScore: q.passingScore, isPublished: q.isPublished }]));
}

module.exports = { QuizError, LIMITS, parseQuizPayload, saveQuiz, teacherView, studentView, grade, parseAnswers, bestScores, summariesByUnit };
