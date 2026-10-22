// Lesson plans (TPRS). Uses the same service as the HTTP API (src/services/lessonPlanService.js): every plan is
// written as a draft and published, so validation, snapshots, Story.text and revisit staging behave exactly as in the app.
//
// Per story, in id order:
//   1. no published revision        -> publish the initial one: 1 keyframe + full story + questions (after) + flashcards + matching
//   2. the story JSON has a `plan` (or --sync-content is used, which also covers stories without one: the file's
//      story text becomes the single keyframe) -> publish it as the next revision, unless
//        - the latest published revision already teaches the same lesson (nothing to do), or
//        - the latest revision is neither that nor an uncurated one (one keyframe, no expressions; i.e. a teacher or an
//          earlier curation changed it): skipped with a warning, unless --force-plans; likewise when the story had an open draft before this run.
// Revisions that students already started stay untouched (progress is pinned to its plan).
const { loadContent, normalizeKey } = require('./lib/content');
const { buildBlocks, signature, sameSignature, isUncurated } = require('./lib/plan');

module.exports = {
  name: 'lesson-plans',
  async run({ models, sequelize, options, log, state }) {
    const { Story, Unit, Question, Vocabulary, LessonPlan } = models;
    const service = require('../../src/services/lessonPlanService');
    const content = state.content || loadContent();
    const unitIds = content.units.map(u => u.id);

    const vocabularyRows = await Vocabulary.findAll({ where: { unitId: unitIds } });
    const vocabularyById = new Map(vocabularyRows.map(v => [v.id, v]));
    const vocabularyRefs = new Map();
    for (const unit of content.units) for (const v of unit.vocabulary) {
      if (!vocabularyById.has(v.id)) throw new Error(`Vocabulary ${v.id} "${v.word}" is not in the database; run the course-content seed first`);
      vocabularyRefs.set(normalizeKey(v.word), vocabularyById.get(v.id));
    }
    const questionsById = new Map((await Question.findAll({ where: { storyId: content.stories.map(s => s.id) } })).map(q => [q.id, q]));
    const storiesByTitle = new Map(content.stories.map(s => [normalizeKey(s.title), { id: s.id }]));
    const storiesById = new Map(content.stories.map(s => [s.id, { title: s.title }]));
    const maps = { questionsById, vocabularyById, storiesById };

    const draftsBefore = new Set((await LessonPlan.findAll({ where: { status: 'draft', storyId: content.stories.map(s => s.id) } })).map(p => p.storyId));
    const summary = { initial: 0, curated: 0, current: 0, skipped: 0 };

    for (const spec of [...content.stories].sort((a, b) => a.id - b.id)) {
      const questionRefs = new Map();
      for (const q of [...spec.questions].sort((a, b) => a.id - b.id)) {
        const row = questionsById.get(q.id);
        if (!row) throw new Error(`Question ${q.id} is not in the database; run the course-content seed first`);
        questionRefs.set(normalizeKey(q.text), { id: row.id, key: q.text, questionText: row.questionText });
      }
      const refs = { questions: questionRefs, vocabulary: vocabularyRefs, stories: storiesByTitle };
      const notes = [];

      await service.draftTransaction(async transaction => {
        const story = await Story.findByPk(spec.id, { include: [{ model: Unit, as: 'unit' }], transaction, lock: transaction.LOCK.UPDATE });
        if (!story) throw new Error(`Story ${spec.id} is not in the database; run the course-content seed first`);
        const hadDraft = draftsBefore.has(story.id);
        const publishedPlan = () => LessonPlan.findOne({ where: { storyId: story.id, status: 'published' }, order: [['revision', 'DESC']], transaction });
        const publish = async blocks => {
          const draft = await service.currentDraft(story, transaction);
          await service.replaceDraftBlocks(story, draft, blocks, transaction);
          await service.publishDraft(story, draft.revision, transaction);
          return draft.revision;
        };

        let latest = await publishedPlan();
        if (!latest) {
          if (hadDraft && !options.forcePlans) {
            summary.skipped++;
            return log(`story ${spec.id} "${spec.title}": has an open draft and no published revision; skipped (--force-plans to override)`);
          }
          const revision = await publish(buildBlocks(story, undefined, refs).blocks);
          summary.initial++;
          notes.push(`revision ${revision} (initial) published`);
          latest = await publishedPlan();
        }

        if (spec.plan || options.syncContent) {
          const latestWithBlocks = await service.planWithBlocks(latest.id, transaction);
          const latestSignature = signature(latestWithBlocks.blocks, maps);
          // What the files say the lesson is. Without a `plan`, that is the whole story text as one keyframe.
          const desired = buildBlocks({ id: story.id, title: story.title, text: spec.text }, spec.plan, refs).blocks;
          const untouched = isUncurated(latestWithBlocks.blocks);
          if (sameSignature(latestSignature, signature(desired, maps))) {
            summary.current++;
            notes.push(`revision ${latest.revision} already matches ${spec.plan ? 'the curated plan' : 'the story text'}`);
          } else if (hadDraft && !options.forcePlans) {
            summary.skipped++;
            notes.push('has an open draft: file content NOT published (--force-plans to override)');
          } else if (!untouched && !options.forcePlans) {
            summary.skipped++;
            notes.push(`revision ${latest.revision} differs from the files and is already curated (edited in the app?): NOT published (--force-plans to override)`);
          } else {
            const revision = await publish(desired);
            summary.curated++;
            notes.push(`revision ${revision} (${spec.plan ? 'curated plan' : 'story text from the files'}) published`);
          }
        } else if (!notes.length) {
          summary.current++;
          notes.push(`revision ${latest.revision} already published`);
        }
        log(`story ${spec.id} "${spec.title}": ${notes.join('; ')}`);
      });
    }

    // Drafts created by this run (reappearance staging) that no story plan consumed: never published silently.
    const leftovers = (await LessonPlan.findAll({ where: { status: 'draft', storyId: content.stories.map(s => s.id) } }))
      .filter(p => !draftsBefore.has(p.storyId));
    for (const draft of leftovers) log(`warning: story ${draft.storyId} has a staged draft (revision ${draft.revision}) waiting for review; add a plan to its JSON or publish it from the editor`);
    log(`plans: ${summary.initial} initial, ${summary.curated} curated, ${summary.current} already current, ${summary.skipped} skipped`);
  }
};
