// Curso de prueba gratis: inscripción automática al registrarse (docs/curso-prueba/PLAN.md).
// El curso se identifica por su slug (variable TRIAL_COURSE_SLUG; por defecto el de la semilla `npm run db:seed:trial`),
// nunca por id, porque el id cambia de una base a otra.
const { Course, Enrollment } = require('../models');

const DEFAULT_TRIAL_SLUG = 'free-trial-spanish-stories';

const trialCourseSlug = () => (process.env.TRIAL_COURSE_SLUG || '').trim() || DEFAULT_TRIAL_SLUG;

/**
 * Inscribe a un alumno recién creado en el curso de prueba. Solo si el curso existe, está publicado y es gratis
 * (price 0): si no, no hace nada y el registro sigue igual. Devuelve la inscripción o null.
 * Va dentro de la transacción del registro (`transaction`): si el registro se deshace, la inscripción también.
 */
async function enrollInTrialCourse(studentId, { transaction } = {}) {
  const course = await Course.findOne({ where: { slug: trialCourseSlug(), isPublished: true, price: 0 }, attributes: ['id'], transaction });
  if (!course) return null;
  return Enrollment.create({ studentId, courseId: course.id, source: 'free' }, { transaction });
}

module.exports = { DEFAULT_TRIAL_SLUG, trialCourseSlug, enrollInTrialCourse };
