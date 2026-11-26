// Carga y valida el contenido del curso de prueba (seeds/content-trial/*.json).
// A diferencia de seeds/content, los archivos NO llevan ids: la semilla identifica cada fila por su clave natural
// (curso por slug, unidad por orden, vocabulario por palabra, historia por título, pregunta por texto).
const fs = require('fs');
const path = require('path');
const { assertCleanText, normalizeKey } = require('../../curated/lib/content');
const { SLUG_PATTERN, slugify } = require('../../../src/utils/slug');

const TRIAL_DIR = path.resolve(__dirname, '..', '..', 'content-trial');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const QUESTION_TYPES = ['yes_no', 'choice'];
const AUDIO_EXTENSION = '.mp3';
const IMAGE_EXTENSIONS = ['.png', '.webp'];

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const isText = value => typeof value === 'string' && value.trim().length > 0;
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Posiciones de las glosas de un keyframe: la primera aparición de cada texto como palabra completa (sin distinguir
 * mayúsculas), con offsets relativos al texto del keyframe, igual que valida POST /api/tooltips.
 * Devuelve [{ startOffset, endOffset, selectedText, tooltipContent }] ordenado por posición.
 * Lanza si una glosa no aparece o si dos glosas se pisan (la API rechaza tooltips solapados).
 */
function glossOffsets(text, glosses, where = 'keyframe') {
  const found = [];
  for (const { text: wanted, gloss } of glosses || []) {
    const match = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(wanted)}(?![\\p{L}\\p{N}])`, 'iu').exec(text);
    if (!match) throw new Error(`${where}: la glosa «${wanted}» no aparece en el texto del keyframe`);
    found.push({ startOffset: match.index, endOffset: match.index + match[0].length, selectedText: match[0], tooltipContent: gloss });
  }
  found.sort((a, b) => a.startOffset - b.startOffset);
  for (let i = 1; i < found.length; i++) {
    if (found[i].startOffset < found[i - 1].endOffset) throw new Error(`${where}: las glosas «${found[i - 1].selectedText}» y «${found[i].selectedText}» se solapan`);
  }
  return found;
}

/** Nombre del audio de un keyframe: h<historia>-k<keyframe>.mp3 (ambos desde 1). */
const keyframeAudioName = (storyNumber, keyframeNumber) => `h${storyNumber}-k${keyframeNumber}${AUDIO_EXTENSION}`;
/** Nombre del audio de una estructura del vocabulario, estable por el slug de la palabra: vocab-le-gusta.mp3. */
const vocabularyAudioName = word => `vocab-${slugify(word)}${AUDIO_EXTENSION}`;
/** Clave h<historia>-k<keyframe> de las ilustraciones y de alt.json. */
const keyframeKey = (storyNumber, keyframeNumber) => `h${storyNumber}-k${keyframeNumber}`;

function validateCourse({ course, unit }) {
  if (!course || !SLUG_PATTERN.test(course.slug || '')) throw new Error('course.json: course.slug inválido');
  for (const field of ['title', 'description']) if (!isText(course[field])) throw new Error(`course.json: falta course.${field}`);
  if (!LEVELS.includes(course.level)) throw new Error(`course.json: course.level debe ser uno de ${LEVELS.join(', ')}`);
  if (!unit || !Number.isInteger(unit.order)) throw new Error('course.json: unit.order debe ser un entero');
  for (const field of ['title', 'description']) if (!isText(unit[field])) throw new Error(`course.json: falta unit.${field}`);
  const words = new Set();
  if (!Array.isArray(unit.vocabulary) || !unit.vocabulary.length) throw new Error('course.json: unit.vocabulary no puede estar vacío');
  for (const v of unit.vocabulary) {
    for (const field of ['word', 'translation', 'example']) if (!isText(v[field])) throw new Error(`course.json: vocabulario sin ${field}: ${JSON.stringify(v)}`);
    const key = normalizeKey(v.word);
    if (words.has(key)) throw new Error(`course.json: palabra de vocabulario repetida: ${v.word}`);
    words.add(key);
    if (v.word.length > 100 || v.translation.length > 100) throw new Error(`course.json: «${v.word}» supera los 100 caracteres de la columna`);
  }
}

function validateStory(story, file, { words, titles }) {
  for (const field of ['title', 'text']) if (!isText(story[field])) throw new Error(`${file}: falta ${field}`);
  if (!Number.isInteger(story.order)) throw new Error(`${file}: order debe ser un entero`);
  if (!story.plan || !Array.isArray(story.plan.keyframes) || !story.plan.keyframes.length) throw new Error(`${file}: plan.keyframes es obligatorio`);
  const joined = story.plan.keyframes.map(k => k.text).join(' ');
  if (story.text !== joined) throw new Error(`${file}: «text» debe ser la unión de los keyframes con un espacio`);

  const questions = new Map();
  for (const q of story.questions || []) {
    if (!isText(q.text) || !QUESTION_TYPES.includes(q.type) || !Array.isArray(q.options) || !q.options.includes(q.correct)) {
      throw new Error(`${file}: pregunta inválida (tipo yes_no o choice, con la correcta entre las opciones): ${JSON.stringify(q.text)}`);
    }
    const key = normalizeKey(q.text);
    if (questions.has(key)) throw new Error(`${file}: pregunta repetida: ${q.text}`);
    questions.set(key, q);
  }
  const needQuestion = text => { if (!questions.has(normalizeKey(text))) throw new Error(`${file}: la pregunta «${text}» del plan no existe`); };
  story.plan.keyframes.forEach((kf, i) => {
    glossOffsets(kf.text, kf.glosses, `${file} keyframe ${i + 1}`);
    for (const g of kf.glosses || []) if (!isText(g.gloss)) throw new Error(`${file} keyframe ${i + 1}: la glosa «${g.text}» no tiene traducción`);
    (kf.questionsAfter || []).forEach(needQuestion);
  });
  for (const item of story.plan.after || []) if (item && item.question) needQuestion(item.question);
  for (const item of [...(story.plan.before || []), ...(story.plan.later || [])]) {
    if (!words.has(normalizeKey(item.expression))) throw new Error(`${file}: la expresión «${item.expression}» no está en el vocabulario`);
  }
  for (const item of story.plan.later || []) {
    if (!titles.has(normalizeKey(item.story))) throw new Error(`${file}: la reaparición de «${item.expression}» apunta a una historia que no existe: «${item.story}»`);
    if (normalizeKey(item.story) === normalizeKey(story.title)) throw new Error(`${file}: «${item.expression}» no puede reaparecer en la misma historia`);
  }
}

function validateQuiz(quiz) {
  if (!isText(quiz.title)) throw new Error('quiz.json: falta title');
  if (!Number.isInteger(quiz.passingScore) || quiz.passingScore < 1 || quiz.passingScore > 100) throw new Error('quiz.json: passingScore debe estar entre 1 y 100');
  if (!Array.isArray(quiz.questions) || !quiz.questions.length) throw new Error('quiz.json: faltan preguntas');
  for (const q of quiz.questions) {
    if (!isText(q.prompt) || !isText(q.explanation)) throw new Error(`quiz.json: pregunta sin enunciado o explicación: ${JSON.stringify(q.prompt)}`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || !q.options.includes(q.correct)) {
      throw new Error(`quiz.json: «${q.prompt}» necesita entre 2 y 6 opciones que incluyan la correcta`);
    }
  }
}

function validateMaterial(material) {
  if (!isText(material.title) || !isText(material.heading)) throw new Error('material.json: faltan title y heading');
  if (!Array.isArray(material.bullets) || material.bullets.length < 5 || material.bullets.length > 7 || !material.bullets.every(isText)) {
    throw new Error('material.json: se esperan entre 5 y 7 viñetas');
  }
}

/**
 * Lee seeds/content-trial, valida todo y devuelve { course, unit, vocabulary, stories, quiz, material }.
 * `dir` (o la variable TRIAL_CONTENT_DIR, pensada para las pruebas automáticas) lee otra carpeta con la misma estructura.
 */
function loadTrialContent({ dir = process.env.TRIAL_CONTENT_DIR || TRIAL_DIR } = {}) {
  const { course, unit } = readJson(path.join(dir, 'course.json'));
  assertCleanText({ course, unit }, 'course.json');
  validateCourse({ course, unit });

  const { vocabulary, ...unitFields } = unit;
  const storiesDir = path.join(dir, 'stories');
  const files = fs.readdirSync(storiesDir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) throw new Error('seeds/content-trial/stories no tiene historias');
  const raw = files.map(file => ({ file, ...readJson(path.join(storiesDir, file)) }));
  raw.forEach(s => assertCleanText({ ...s, file: undefined }, s.file));

  const words = new Set(vocabulary.map(v => normalizeKey(v.word)));
  const titles = new Set();
  for (const s of raw) {
    if (!isText(s.title)) throw new Error(`${s.file}: falta title`);
    const key = normalizeKey(s.title);
    if (titles.has(key)) throw new Error(`Título de historia repetido: ${s.title}`);
    titles.add(key);
  }
  raw.forEach(s => validateStory(s, s.file, { words, titles }));
  // El número de historia (h1, h2, h3) es la posición del archivo: nombra audios e ilustraciones.
  const stories = raw.map((s, i) => ({ number: i + 1, ...s }));

  const quiz = readJson(path.join(dir, 'quiz.json'));
  assertCleanText(quiz, 'quiz.json');
  validateQuiz(quiz);
  const material = readJson(path.join(dir, 'material.json'));
  assertCleanText(material, 'material.json');
  validateMaterial(material);
  return { dir, course, unit: unitFields, vocabulary, stories, quiz, material };
}

/**
 * Forma que espera src/services/tprsAudit.js (`fromContent`). Los ids son SOLO en memoria, para la auditoría:
 * el contenido de prueba no tiene ids y nada de esto se guarda.
 */
function toAuditContent(content) {
  const unitId = 1;
  return {
    course: content.course,
    units: [{ id: unitId, order: content.unit.order, title: content.unit.title, description: content.unit.description, vocabulary: content.vocabulary }],
    stories: content.stories.map(s => ({ id: s.number, unitId, order: s.order, title: s.title, text: s.text, questions: s.questions, plan: s.plan }))
  };
}

module.exports = {
  TRIAL_DIR, AUDIO_EXTENSION, IMAGE_EXTENSIONS,
  loadTrialContent, toAuditContent, glossOffsets, keyframeAudioName, vocabularyAudioName, keyframeKey
};
