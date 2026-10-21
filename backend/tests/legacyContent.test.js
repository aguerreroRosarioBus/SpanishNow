// Content that predates the TPRS editor: the dump's stories must be readable after the migrations.
const { Op } = require('sequelize');
const { Story, Unit, Question, LessonPlan, LessonBlock, ActivityConfig, Enrollment } = require('../src/models');
const sequelize = require('../src/config/database');
const { createUser, as, planUrl, openLesson, findKeys, tokenFor } = require('./helpers/fixtures');

describe('Migrated legacy content (Dump20260122.sql + migrations)', () => {
  let student; let story; let questions;
  beforeAll(async () => {
    // First story of the dump's course that has questions.
    const [rows] = await sequelize.query(
      'SELECT s.id AS storyId, u.courseId FROM stories s JOIN units u ON u.id = s.unitId JOIN questions q ON q.storyId = s.id ORDER BY s.id LIMIT 1');
    expect(rows).toHaveLength(1);
    story = await Story.findByPk(rows[0].storyId);
    questions = await Question.findAll({ where: { storyId: story.id }, order: [['id', 'ASC']] });
    student = await createUser('student', 'legacy-student');
    await Enrollment.create({ studentId: student.id, courseId: rows[0].courseId });
  });

  test('the schema reflects the migrations (story-level activity configs, lesson tables)', async () => {
    const columns = await sequelize.getQueryInterface().describeTable('activity_configs');
    expect(columns.storyId).toBeDefined();
    expect(columns.unitId).toBeUndefined();
    expect(await ActivityConfig.count()).toBeGreaterThan(0);
    expect((await sequelize.getQueryInterface().describeTable('questions')).audioUrl).toBeDefined();
  });

  test('every legacy story has exactly one published revision with one keyframe and the full story', async () => {
    // Stories that come from the dump (created before any test fixture).
    const stories = await Story.findAll({ where: { createdAt: { [Op.lt]: new Date('2026-02-01') } }, include: [{ model: LessonPlan, as: 'lessonPlans' }] });
    expect(stories.length).toBeGreaterThan(0);
    for (const s of stories) {
      expect(s.lessonPlans.map(p => [p.revision, p.status])).toEqual([[1, 'published']]);
    }
    const plan = await LessonPlan.findOne({ where: { storyId: story.id, status: 'published' } });
    const blocks = await LessonBlock.findAll({ where: { planId: plan.id }, order: [['position', 'ASC']] });
    expect(blocks.filter(b => b.type === 'keyframe')).toHaveLength(1);
    expect(blocks.filter(b => b.type === 'full_story')).toHaveLength(1);
    expect(blocks.find(b => b.type === 'keyframe').text).toBe(story.text);
    // Old questions move to the "after" phase; no narrative point is inferred.
    const questionBlocks = blocks.filter(b => b.type === 'question');
    expect(questionBlocks.map(b => b.questionId)).toEqual(questions.map(q => q.id));
    expect(questionBlocks.every(b => b.phase === 'after')).toBe(true);
  });

  test('a student can read an uncurated story, without correctAnswer, and keep the full text', async () => {
    const res = await openLesson(student, story.id);

    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(1);
    expect(res.body.story.fullStoryText).toBe(story.text);
    expect(res.body.blocks.filter(b => b.type === 'question')).toHaveLength(questions.length);
    expect(findKeys(res.body, /^correctAnswer$/)).toEqual([]);
  });

  test('legacy stories are still managed by their owner, who can open a new draft without touching the published revision', async () => {
    const unit = await Unit.findByPk(story.unitId, { include: ['course'] });
    const owner = { id: unit.course.teacherId, role: 'teacher', token: tokenFor({ id: unit.course.teacherId, role: 'teacher' }) };

    const res = await as(owner).get(`${planUrl(story.id)}/draft`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'draft', revision: 2 });
    expect(res.body.blocks.some(b => b.type === 'question' && typeof b.questionSnapshot.correctAnswer === 'string')).toBe(true);
    expect((await openLesson(student, story.id)).body.revision).toBe(1);
  });
});
