// Planes de lección (TPRS) del curso de prueba. Usa el mismo servicio que la API (src/services/lessonPlanService.js) y
// el mismo criterio que seeds/curated/03-lesson-plans.js: cada plan se escribe como borrador y se publica, así la
// validación, las instantáneas, Story.text y la programación de reapariciones se comportan igual que en la app.
//
// Por historia, en orden:
//   1. sin revisión publicada -> se publica el plan del archivo como revisión 1 (si hay un borrador abierto, se avisa y se salta, salvo --force-plans)
//   2. con revisión publicada que enseña lo mismo -> no hace nada
//   3. con revisión publicada distinta -> se publica una revisión nueva solo si la última está sin curar (un keyframe, sin expresiones
//      ni preguntas durante la narración) o con --force-plans; si no, se salta con un aviso (¿la editó un docente?).
//      Nunca se cambia una revisión que los alumnos ya usan: se publica una nueva y su progreso queda fijado a la anterior.
const { normalizeKey } = require('../curated/lib/content');
const { buildBlocks, signature, sameSignature, isUncurated } = require('../curated/lib/plan');
const { requireRows } = require('./lib/rows');

module.exports = {
  name: 'lesson-plans',
  async run({ models, options, log, content }) {
    const { Story, Unit, LessonPlan } = models;
    const service = require('../../src/services/lessonPlanService');
    const rows = await requireRows({ models, content });
    const stories = rows.stories;

    const vocabularyRefs = new Map([...rows.vocabulary].map(([key, row]) => [key, { id: row.id }]));
    const vocabularyById = new Map([...rows.vocabulary.values()].map(row => [row.id, row]));
    const storiesByTitle = new Map(stories.map(({ row }) => [normalizeKey(row.title), { id: row.id }]));
    const storiesById = new Map(stories.map(({ row }) => [row.id, { title: row.title }]));
    const questionsById = new Map(stories.flatMap(({ questions }) => [...questions.values()]).map(q => [q.id, q]));
    const maps = { questionsById, vocabularyById, storiesById };

    const storyIds = stories.map(({ row }) => row.id);
    const draftsBefore = new Set((await LessonPlan.findAll({ where: { status: 'draft', storyId: storyIds } })).map(p => p.storyId));
    const summary = { published: 0, current: 0, skipped: 0 };

    for (const { spec, row, questions } of stories) { // en el orden de los archivos: una historia programa reapariciones en las siguientes
      const questionRefs = new Map([...questions].map(([key, q]) => [key, { id: q.id, key: q.questionText, questionText: q.questionText }]));
      const refs = { questions: questionRefs, vocabulary: vocabularyRefs, stories: storiesByTitle };
      const notes = [];

      await service.draftTransaction(async transaction => {
        const story = await Story.findByPk(row.id, { include: [{ model: Unit, as: 'unit' }], transaction, lock: transaction.LOCK.UPDATE });
        const hadDraft = draftsBefore.has(story.id);
        const publishedPlan = () => LessonPlan.findOne({ where: { storyId: story.id, status: 'published' }, order: [['revision', 'DESC']], transaction });
        const publish = async blocks => {
          const draft = await service.currentDraft(story, transaction);
          await service.replaceDraftBlocks(story, draft, blocks, transaction);
          await service.publishDraft(story, draft.revision, transaction);
          return draft.revision;
        };
        const desired = buildBlocks({ id: story.id, title: story.title, text: spec.text }, spec.plan, refs).blocks;

        const latest = await publishedPlan();
        if (!latest) {
          if (hadDraft && !options.forcePlans) {
            summary.skipped++;
            notes.push('tiene un borrador abierto y ninguna revisión publicada: se salta (--force-plans para forzar)');
          } else {
            const revision = await publish(desired);
            summary.published++;
            notes.push(`revisión ${revision} publicada`);
          }
        } else {
          const stored = await service.planWithBlocks(latest.id, transaction);
          if (sameSignature(signature(stored.blocks, maps), signature(desired, maps))) {
            summary.current++;
            notes.push(`la revisión ${latest.revision} ya coincide con el plan del archivo`);
          } else if (hadDraft && !options.forcePlans) {
            summary.skipped++;
            notes.push('tiene un borrador abierto: el plan del archivo NO se publicó (--force-plans para forzar)');
          } else if (!isUncurated(stored.blocks) && !options.forcePlans) {
            summary.skipped++;
            notes.push(`la revisión ${latest.revision} difiere del archivo y ya está curada (¿editada en la app?): NO se publicó (--force-plans para forzar)`);
          } else {
            const revision = await publish(desired);
            summary.published++;
            notes.push(`revisión ${revision} publicada`);
          }
        }
        log(`historia «${spec.title}»: ${notes.join('; ')}`);
      });
    }

    // Borradores que dejó esta corrida (reapariciones programadas) y que ningún plan consumió: nunca se publican a escondidas.
    const leftovers = (await LessonPlan.findAll({ where: { status: 'draft', storyId: storyIds } })).filter(p => !draftsBefore.has(p.storyId));
    for (const draft of leftovers) log(`aviso: la historia ${draft.storyId} quedó con un borrador (revisión ${draft.revision}) pendiente de revisión; publicalo desde el editor`);
    log(`planes: ${summary.published} publicados, ${summary.current} ya vigentes, ${summary.skipped} saltados`);
  }
};
