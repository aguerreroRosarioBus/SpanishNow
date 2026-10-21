// Fixtures and API helpers shared by the integration suites.
// Users, courses and stories are created through the models with unique names,
// so suites can run against the same database without cleaning up after each other.
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../src/app');
const { User, Course, Unit, Story, Question, Vocabulary, Enrollment } = require('../../src/models');

const PASSWORD = 'jest-password-1';

// Same payload and secret fallback as src/routes/auth.routes.js
const tokenFor = user => jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });

async function createUser(role, label) {
  const user = await User.create({ name: `${label} ${randomUUID().slice(0, 6)}`, email: `${label}-${randomUUID()}@jest.test`, password: PASSWORD, role });
  return Object.assign(user, { token: tokenFor(user) });
}

function as(user) {
  const withAuth = req => (user ? req.set('Authorization', `Bearer ${user.token}`) : req);
  return {
    get: path => withAuth(request(app).get(path)),
    post: (path, body = {}) => withAuth(request(app).post(path)).send(body),
    put: (path, body = {}) => withAuth(request(app).put(path)).send(body),
    delete: path => withAuth(request(app).delete(path))
  };
}

/** Teacher owner, other teacher, two enrolled students, one student outside the course, plus a foreign course. */
async function createWorld() {
  const [teacher, otherTeacher, student, student2, outsider] = await Promise.all([
    createUser('teacher', 'owner'), createUser('teacher', 'other-teacher'),
    createUser('student', 'student'), createUser('student', 'student2'), createUser('student', 'outsider')
  ]);
  const course = await Course.create({ title: `Curso ${randomUUID().slice(0, 6)}`, description: 'Curso de prueba', level: 'A1', teacherId: teacher.id });
  const unit = await Unit.create({ courseId: course.id, title: 'Unidad 1', description: 'Saludos', order: 0 });
  const vocab = await Vocabulary.create({ unitId: unit.id, word: 'Me llamo', translation: 'My name is', example: 'Me llamo María.' });
  const vocab2 = await Vocabulary.create({ unitId: unit.id, word: 'Mucho gusto', translation: 'Nice to meet you', example: 'Mucho gusto, Juan.' });
  const enrollments = {
    student: await Enrollment.create({ studentId: student.id, courseId: course.id }),
    student2: await Enrollment.create({ studentId: student2.id, courseId: course.id })
  };

  // A different teacher's course: useful to prove cross-course references are rejected.
  const foreignCourse = await Course.create({ title: `Ajeno ${randomUUID().slice(0, 6)}`, description: 'Otro curso', level: 'A1', teacherId: otherTeacher.id });
  const foreignUnit = await Unit.create({ courseId: foreignCourse.id, title: 'Unidad ajena', description: 'x', order: 0 });
  const foreignStory = await Story.create({ unitId: foreignUnit.id, title: 'Historia ajena', text: 'Texto ajeno.', order: 0 });
  const foreignVocab = await Vocabulary.create({ unitId: foreignUnit.id, word: 'Adiós', translation: 'Bye' });

  return { teacher, otherTeacher, student, student2, outsider, course, unit, vocab, vocab2, enrollments, foreignCourse, foreignStory, foreignVocab };
}

/** A story of the world's unit with two questions whose answers are known. */
async function createStory(world, title = 'Historia') {
  const story = await Story.create({ unitId: world.unit.id, title: `${title} ${randomUUID().slice(0, 6)}`, text: 'Texto original de la historia.', order: 0 });
  const q1 = await Question.create({ storyId: story.id, questionText: '¿Dónde está María?', answerType: 'choice',
    options: ['En la fiesta', 'En la escuela'], correctAnswer: 'En la fiesta' });
  const q2 = await Question.create({ storyId: story.id, questionText: '¿María conoce a Juan?', answerType: 'yes_no', correctAnswer: 'Sí' });
  return { story, q1, q2 };
}

/** Typical TPRS plan: expression, keyframe+question twice, full story and one reinforcement. */
function standardBlocks({ vocab, q1, q2 }, extra = {}) {
  const keys = { exp: randomUUID(), k1: randomUUID(), q1: randomUUID(), k2: randomUUID(), q2: randomUUID(), full: randomUUID(), flash: randomUUID() };
  const blocks = [
    { blockKey: keys.exp, type: 'expression', phase: 'before', vocabularyId: vocab.id, vocabularyRole: 'target' },
    { blockKey: keys.k1, type: 'keyframe', phase: 'during', text: 'María va a una fiesta.' },
    { blockKey: keys.q1, type: 'question', phase: 'during', questionId: q1.id, contextBlockKey: keys.k1 },
    { blockKey: keys.k2, type: 'keyframe', phase: 'during', text: 'María ve a Juan.' },
    { blockKey: keys.q2, type: 'question', phase: 'during', questionId: q2.id, contextBlockKey: keys.k2 },
    { blockKey: keys.full, type: 'full_story', phase: 'after' },
    { blockKey: keys.flash, type: 'flashcards', phase: 'after' },
    ...(extra.blocks || [])
  ];
  return { blocks, keys };
}

const planUrl = storyId => `/api/lesson-plans/story/${storyId}`;
const stripPositions = blocks => blocks.map(({ position, ...rest }) => rest);

/** Replaces the teacher's draft with `blocks` (no publish). Returns the response. */
async function saveDraft(teacher, storyId, blocks) {
  const draft = await as(teacher).get(`${planUrl(storyId)}/draft`);
  if (draft.status !== 200) throw new Error(`GET draft failed: ${draft.status} ${JSON.stringify(draft.body)}`);
  return as(teacher).put(`${planUrl(storyId)}/draft`, { revision: draft.body.revision, blocks: stripPositions(blocks) });
}

/** Saves `blocks` as the draft and publishes it. Throws if any step fails. */
async function publishPlan(teacher, storyId, blocks) {
  const saved = await saveDraft(teacher, storyId, blocks);
  if (saved.status !== 200) throw new Error(`PUT draft failed: ${saved.status} ${JSON.stringify(saved.body)}`);
  const published = await as(teacher).post(`${planUrl(storyId)}/publish`, { revision: saved.body.revision });
  if (published.status !== 201) throw new Error(`publish failed: ${published.status} ${JSON.stringify(published.body)}`);
  return published.body;
}

/** Student opens the lesson (creating or resuming progress). */
const openLesson = (student, storyId) => as(student).get(planUrl(storyId));
const visit = (student, progressId, blockKey) => as(student).put(`/api/lesson-plans/progress/${progressId}/current-block`, { blockKey });
const answer = (student, progressId, body) => as(student).post(`/api/lesson-plans/progress/${progressId}/answers`, body);

/** Recursively collects every object key matching `pattern`. */
function findKeys(value, pattern, path = '$', found = []) {
  if (Array.isArray(value)) value.forEach((item, i) => findKeys(item, pattern, `${path}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (pattern.test(key)) found.push(`${path}.${key}`);
      findKeys(child, pattern, `${path}.${key}`, found);
    }
  }
  return found;
}

module.exports = { app, as, createUser, createWorld, createStory, standardBlocks, planUrl, stripPositions,
  saveDraft, publishPlan, openLesson, visit, answer, findKeys, tokenFor };
