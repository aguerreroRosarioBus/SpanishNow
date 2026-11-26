// Busca en la base las filas del curso de prueba por clave natural (nunca por id fijo) y ayuda a leer su plan publicado.
//   curso: slug · unidad: courseId + order · vocabulario: unitId + palabra · historia: unitId + título · pregunta: storyId + texto
// Las comparaciones de texto se hacen en JavaScript con normalizeKey (sin tildes ni mayúsculas), no con la collation de MySQL.
const { normalizeKey } = require('../../curated/lib/content');
const { trialCourseSlug } = require('../../../src/services/trialEnrollment');

const byKey = (rows, field) => new Map(rows.map(row => [normalizeKey(row[field]), row]));

/**
 * { course, unit, vocabulary: Map(palabra -> fila), stories: [{ spec, row, questions: Map(texto -> fila) }] }.
 * Cada parte es null (o vacía) si todavía no existe; `require` hace fallar con un mensaje claro si falta algo.
 */
async function findRows({ models: { Course, Unit, Vocabulary, Story, Question }, content, transaction }) {
  const course = await Course.findOne({ where: { slug: trialCourseSlug() }, transaction });
  const unit = course ? await Unit.findOne({ where: { courseId: course.id, order: content.unit.order }, transaction }) : null;
  const vocabulary = unit ? byKey(await Vocabulary.findAll({ where: { unitId: unit.id }, transaction }), 'word') : new Map();
  const storyRows = unit ? byKey(await Story.findAll({ where: { unitId: unit.id }, transaction }), 'title') : new Map();
  const questionRows = storyRows.size ? await Question.findAll({ where: { storyId: [...storyRows.values()].map(s => s.id) }, transaction }) : [];
  const stories = content.stories.map(spec => {
    const row = storyRows.get(normalizeKey(spec.title)) || null;
    const questions = byKey(questionRows.filter(q => row && q.storyId === row.id), 'questionText');
    return { spec, row, questions };
  });
  return { course, unit, vocabulary, stories, unknownStories: [...storyRows.values()].filter(row => !content.stories.some(s => normalizeKey(s.title) === normalizeKey(row.title))) };
}

/** Como findRows, pero falla si el curso de prueba todavía no se sembró completo. */
async function requireRows(context) {
  const rows = await findRows(context);
  if (!rows.course || !rows.unit || rows.stories.some(s => !s.row)) {
    throw new Error(`El curso de prueba «${trialCourseSlug()}» no está sembrado completo; corré antes el paso course-content`);
  }
  return rows;
}

/** Última revisión publicada de una historia con sus keyframes activos en orden (los bloques del plan que ven los alumnos). */
async function publishedKeyframes({ LessonPlan, LessonBlock }, storyId, transaction) {
  const plan = await LessonPlan.findOne({ where: { storyId, status: 'published' }, order: [['revision', 'DESC']], transaction });
  if (!plan) return { plan: null, keyframes: [] };
  const keyframes = await LessonBlock.findAll({ where: { planId: plan.id, type: 'keyframe', active: true }, order: [['position', 'ASC']], transaction });
  return { plan, keyframes };
}

/**
 * Empareja los keyframes del archivo con los del plan publicado, por posición, y solo cuando el texto es el mismo
 * (si un docente editó el keyframe, no se le agrega audio, imagen ni glosas encima).
 */
function matchKeyframes(spec, keyframes) {
  return spec.plan.keyframes.map((kf, index) => {
    const block = keyframes[index];
    return { index, number: index + 1, spec: kf, block: block && (block.text || '').trim() === kf.text.trim() ? block : null, edited: Boolean(block) && (block.text || '').trim() !== kf.text.trim() };
  });
}

module.exports = { byKey, findRows, requireRows, publishedKeyframes, matchKeyframes };
