// Course, units, stories, questions and vocabulary from seeds/content/*.json.
// Rows are matched by their explicit id. By default only MISSING rows are created and existing ones are never
// overwritten (a teacher may have edited them); --sync-content updates the fields below from the files.
//   course: title, description, level      unit: title, description, order
//   story: unitId, title, order (NOT text: the text of a story is derived from its published lesson plan)
//   vocabulary / question: every field
const { loadContent } = require('./lib/content');

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function upsert(model, id, values, { sync, drift, label, createOnly = {} }) {
  const row = await model.findByPk(id);
  if (!row) {
    await model.create({ id, ...values, ...createOnly });
    return 'created';
  }
  const changed = Object.keys(values).filter(key => !sameValue(row.get(key), values[key]));
  if (!changed.length) return 'unchanged';
  if (sync) {
    await row.update(values);
    return 'updated';
  }
  drift.push(`${label} (${changed.join(', ')})`);
  return 'kept';
}

module.exports = {
  name: 'course-content',
  async run({ models: { Course, Unit, Story, Question, Vocabulary, User }, options, log, state }) {
    const content = loadContent();
    state.content = content;
    const teacher = await User.findOne({ where: { email: content.course.teacherEmail, role: 'teacher' } });
    if (!teacher) throw new Error(`Teacher ${content.course.teacherEmail} not found; the accounts seed must run first`);

    const counts = { created: 0, updated: 0, unchanged: 0, kept: 0 };
    const drift = [];
    const apply = async (model, id, values, label, createOnly) => {
      counts[await upsert(model, id, values, { sync: options.syncContent, drift, label, createOnly })]++;
    };

    const { id: courseId, title, description, level } = content.course;
    await apply(Course, courseId, { title, description, level, teacherId: teacher.id }, `course ${courseId}`,
      { isPublished: true }); // the demo course is visible in the student catalog; existing rows are never touched
    for (const unit of content.units) {
      await apply(Unit, unit.id, { courseId, title: unit.title, description: unit.description, order: unit.order }, `unit ${unit.id}`);
    }
    for (const unit of content.units) {
      for (const v of unit.vocabulary) {
        await apply(Vocabulary, v.id, { unitId: unit.id, word: v.word, translation: v.translation, example: v.example, partOfSpeech: v.partOfSpeech },
          `vocabulary ${v.id} "${v.word}"`);
      }
    }
    for (const story of content.stories) {
      await apply(Story, story.id, { unitId: story.unitId, title: story.title, order: story.order }, `story ${story.id}`, { text: story.text });
    }
    for (const story of content.stories) {
      for (const q of story.questions) {
        await apply(Question, q.id, { storyId: story.id, questionText: q.text, answerType: q.type, options: q.options, correctAnswer: q.correct },
          `question ${q.id}`);
      }
    }
    log(`${content.units.length} units, ${content.stories.length} stories, ${content.stories.reduce((n, s) => n + s.questions.length, 0)} questions, ` +
      `${content.units.reduce((n, u) => n + u.vocabulary.length, 0)} vocabulary entries: ${counts.created} created, ${counts.updated} updated, ` +
      `${counts.unchanged} unchanged, ${counts.kept} different in the database and kept`);
    if (drift.length) {
      log(`${drift.length} row(s) differ from seeds/content; run with --sync-content to overwrite them:`);
      drift.slice(0, 10).forEach(d => log(`  - ${d}`));
      if (drift.length > 10) log(`  ... and ${drift.length - 10} more`);
    }
  }
};
