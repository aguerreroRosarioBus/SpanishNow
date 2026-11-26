// Curso de prueba, unidad, vocabulario, historias y preguntas desde seeds/content-trial.
// Cada fila se identifica por su clave natural (ver lib/rows.js). Por defecto SOLO se crean las que faltan y una fila
// existente no se toca (un docente pudo editarla); --sync-content actualiza lo que el archivo dice distinto:
//   curso: título, descripción, nivel      unidad: título, descripción      vocabulario: traducción, ejemplo, tipo
//   historia: orden (NO el texto: sale del plan publicado)      pregunta: tipo, opciones, respuesta
// Nunca se cambian: slug, precio, publicación ni docente del curso. No crea cuentas: el docente debe existir.
const { findRows } = require('./lib/rows');
const { normalizeKey } = require('../curated/lib/content');
const { trialCourseSlug } = require('../../src/services/trialEnrollment');
const { isLocalHost } = require('../curated/01-accounts');

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const DEFAULT_LOCAL_TEACHER = 'admin@gmail.com';

/** Docente dueño del curso: TRIAL_COURSE_TEACHER_EMAIL, o admin@gmail.com solo si la base es local. Debe existir con rol teacher. */
async function resolveTeacher({ User, host }) {
  const email = (process.env.TRIAL_COURSE_TEACHER_EMAIL || '').trim() || (isLocalHost(host) ? DEFAULT_LOCAL_TEACHER : '');
  if (!email) throw new Error('Falta el docente del curso de prueba: definí TRIAL_COURSE_TEACHER_EMAIL con el email de una cuenta docente existente');
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error(`El docente ${email} no existe; la semilla no crea cuentas. Creá la cuenta (rol teacher) o cambiá TRIAL_COURSE_TEACHER_EMAIL`);
  if (user.role !== 'teacher') throw new Error(`La cuenta ${email} existe pero su rol es ${user.role}; el curso de prueba necesita un docente`);
  return user;
}

module.exports = {
  name: 'course-content',
  resolveTeacher,
  async run({ models, sequelize, options, log, content }) {
    const { Course, Unit, Vocabulary, Story, Question, User } = models;
    const counts = { created: 0, updated: 0, unchanged: 0, kept: 0 };
    const drift = [];

    await sequelize.transaction(async transaction => {
      // Crea la fila si falta; si existe y difiere, la deja (y lo avisa) salvo --sync-content.
      const apply = async (model, row, values, createValues, label) => {
        if (!row) {
          counts.created++;
          return model.create({ ...values, ...createValues }, { transaction });
        }
        const changed = Object.keys(values).filter(key => !sameValue(row.get(key), values[key]));
        if (!changed.length) { counts.unchanged++; return row; }
        if (options.syncContent) { counts.updated++; return row.update(values, { transaction }); }
        counts.kept++;
        drift.push(`${label} (${changed.join(', ')})`);
        return row;
      };

      const found = await findRows({ models, content, transaction });
      let teacherId;
      if (!found.course) teacherId = (await resolveTeacher({ User, host: sequelize.config.host })).id;
      const { title, description, level } = content.course;
      const courseSlug = trialCourseSlug(); // TRIAL_COURSE_SLUG manda sobre el slug del archivo (son el mismo por defecto)
      const course = await apply(Course, found.course, { title, description, level },
        { slug: courseSlug, teacherId, price: 0, isPublished: true }, `curso «${courseSlug}»`);
      if (found.course && (course.price !== 0 || !course.isPublished)) {
        log(`aviso: el curso existente no es gratis y publicado (precio ${course.price}, publicado ${course.isPublished}); no se modifica y los alumnos no se inscribirán solos`);
      }

      const unit = await apply(Unit, found.unit, { title: content.unit.title, description: content.unit.description },
        { courseId: course.id, order: content.unit.order }, `unidad ${content.unit.order}`);

      for (const v of content.vocabulary) {
        const key = normalizeKey(v.word);
        await apply(Vocabulary, found.vocabulary.get(key), { translation: v.translation, example: v.example, partOfSpeech: v.partOfSpeech || null },
          { unitId: unit.id, word: v.word }, `vocabulario «${v.word}»`);
      }

      for (const { spec, row: existing, questions: existingQuestions } of found.stories) {
        const story = await apply(Story, existing, { order: spec.order }, { unitId: unit.id, title: spec.title, text: spec.text }, `historia «${spec.title}»`);
        for (const q of spec.questions) {
          const key = normalizeKey(q.text);
          await apply(Question, existingQuestions.get(key), { answerType: q.type, options: q.options, correctAnswer: q.correct },
            { storyId: story.id, questionText: q.text }, `pregunta «${q.text}»`);
        }
      }
    });

    log(`curso «${trialCourseSlug()}»: 1 unidad, ${content.stories.length} historias, ${content.stories.reduce((n, s) => n + s.questions.length, 0)} preguntas, ` +
      `${content.vocabulary.length} estructuras de vocabulario: ${counts.created} creadas, ${counts.updated} actualizadas, ${counts.unchanged} sin cambios, ${counts.kept} distintas en la base y conservadas`);
    const { unknownStories } = await findRows({ models, content });
    if (unknownStories.length) log(`aviso: la unidad tiene historias que no están en los archivos (¿renombradas o agregadas por un docente?): ${unknownStories.map(s => `«${s.title}»`).join(', ')}`);
    if (drift.length) {
      log(`${drift.length} fila(s) difieren de seeds/content-trial; --sync-content las sobrescribe:`);
      drift.slice(0, 10).forEach(d => log(`  - ${d}`));
      if (drift.length > 10) log(`  ... y ${drift.length - 10} más`);
    }
  }
};
