// Post-rebuild checks against the curated content.   node src/db/verify.js
// Read-only. Exit code 1 when something is missing. Target: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME.
require('dotenv').config({ quiet: true });
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Course, Unit, Story, Question, Vocabulary, User, Enrollment, LessonPlan, LessonBlock } = require('../models');
const { loadContent, loadAccounts, MOJIBAKE } = require('../../seeds/curated/lib/content');

async function main() {
  const { host, port, database } = sequelize.config;
  console.log(`Database: ${host}:${port}/${database}`);
  await sequelize.authenticate();
  const content = loadContent();
  const { accounts } = loadAccounts();
  const failures = [];
  const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures.push(label);
  };
  const countIn = async (model, ids, field = 'id') => model.count({ where: { [field]: { [Op.in]: ids } } });

  const storyIds = content.stories.map(s => s.id);
  const unitIds = content.units.map(u => u.id);
  const questionIds = content.stories.flatMap(s => s.questions.map(q => q.id));
  const vocabularyIds = content.units.flatMap(u => u.vocabulary.map(v => v.id));

  check('course', await countIn(Course, [content.course.id]) === 1, `id ${content.course.id}`);
  check('units', await countIn(Unit, unitIds) === unitIds.length, `${unitIds.length} expected`);
  check('stories', await countIn(Story, storyIds) === storyIds.length, `${storyIds.length} expected`);
  check('questions', await countIn(Question, questionIds) === questionIds.length, `${questionIds.length} expected`);
  check('vocabulary', await countIn(Vocabulary, vocabularyIds) === vocabularyIds.length, `${vocabularyIds.length} expected`);

  const texts = [
    ...(await Story.findAll({ where: { id: storyIds } })).flatMap(s => [s.title, s.text]),
    ...(await Question.findAll({ where: { id: questionIds } })).flatMap(q => [q.questionText, q.correctAnswer]),
    ...(await Vocabulary.findAll({ where: { id: vocabularyIds } })).flatMap(v => [v.word, v.example])
  ].filter(Boolean);
  check('no broken encoding in stored texts', !texts.some(t => MOJIBAKE.test(t)));

  for (const story of content.stories) {
    const plan = await LessonPlan.findOne({ where: { storyId: story.id, status: 'published' }, order: [['revision', 'DESC']], include: [{ model: LessonBlock, as: 'blocks' }] });
    const blocks = plan ? plan.blocks.filter(b => b.active) : [];
    const keyframes = blocks.filter(b => b.type === 'keyframe').length;
    const ok = !!plan && keyframes >= 1 && blocks.filter(b => b.type === 'full_story').length === 1;
    const expectedKeyframes = story.plan && story.plan.keyframes ? story.plan.keyframes.length : 1;
    check(`story ${story.id} "${story.title}" has a published revision`, ok && keyframes === expectedKeyframes,
      plan ? `revision ${plan.revision}, ${keyframes} keyframe(s), ${blocks.filter(b => b.type === 'question').length} question(s)` : 'none');
  }

  const teacher = accounts.find(a => a.role === 'teacher');
  const teacherRow = await User.findOne({ where: { email: teacher.email, role: 'teacher' } });
  check('test teacher exists and owns the course', !!teacherRow && (await Course.count({ where: { id: content.course.id, teacherId: teacherRow.id } })) === 1);
  for (const account of accounts.filter(a => a.role === 'student')) {
    const student = await User.findOne({ where: { email: account.email, role: 'student' } });
    check(`student ${account.email} is enrolled`, !!student && (await Enrollment.count({ where: { studentId: student.id, courseId: content.course.id } })) === 1);
  }

  console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
  if (failures.length) process.exitCode = 1;
}

main().then(() => sequelize.close()).catch(async error => {
  console.error(`\nVerification failed: ${error.message}`);
  process.exitCode = 1;
  await sequelize.close().catch(() => {});
});
