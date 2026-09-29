const express = require('express');
const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const router = express.Router();
const { authMiddleware, isTeacher, isStudent } = require('../middlewares/auth.middleware');
const sequelize = require('../config/database');
const { Story, Unit, Course, Question, Vocabulary, Enrollment, LessonPlan, LessonBlock,
  LessonProgress, LessonAnswer, LessonReinforcement, Tooltip } = require('../models');

const TYPES = new Set(['expression', 'keyframe', 'question', 'full_story', 'flashcards', 'matching', 'listen_repeat']);
const PHASES = { before: 0, during: 1, after: 2, later: 3 };
const REINFORCEMENTS = new Set(['flashcards', 'matching', 'listen_repeat']);
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const sendError = (res, error) => res.status(error.status || 500).json({ error: error.message });
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const normalized = value => String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

router.use((req, res, next) => {
  if (['PUT', 'POST'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'A JSON object is required' });
  }
  next();
});

async function storyForTeacher(storyId, userId, transaction) {
  if (!validId(storyId)) fail(400, 'Invalid storyId');
  const story = await Story.findByPk(storyId, { include: [{ model: Unit, as: 'unit', include: [{ model: Course, as: 'course' }] }], transaction, lock: transaction.LOCK.UPDATE });
  if (!story) fail(404, 'Story not found');
  if (story.unit.course.teacherId !== userId) fail(403, 'Not authorized for this course');
  return story;
}

async function enrollmentForStory(storyId, userId, transaction) {
  if (!validId(storyId)) fail(400, 'Invalid storyId');
  const story = await Story.findByPk(storyId, { include: [{ model: Unit, as: 'unit' }], transaction });
  if (!story) fail(404, 'Story not found');
  const enrollment = await Enrollment.findOne({ where: { studentId: userId, courseId: story.unit.courseId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!enrollment) fail(403, 'Student is not enrolled in this course');
  return { story, enrollment };
}

async function planWithBlocks(planId, transaction) {
  return LessonPlan.findByPk(planId, { include: [{ model: LessonBlock, as: 'blocks' }],
    order: [[{ model: LessonBlock, as: 'blocks' }, 'position', 'ASC']], transaction });
}

function blockData(block) {
  const b = block.toJSON ? block.toJSON() : block;
  const { id, planId, createdAt, updatedAt, ...publicFields } = b;
  return publicFields;
}

function studentBlock(block) {
  const b = blockData(block);
  if (b.questionSnapshot) {
    const { correctAnswer, ...question } = b.questionSnapshot;
    b.question = question;
  }
  if (b.vocabularySnapshot) b.vocabulary = b.vocabularySnapshot;
  delete b.questionSnapshot;
  delete b.vocabularySnapshot;
  return b;
}

function planDto(plan, student = false) {
  const visible = student ? plan.blocks.filter(b => b.active && b.phase !== 'later') : plan.blocks;
  const blocks = visible.map(student ? studentBlock : blockData);
  return { id: plan.id, storyId: plan.storyId, revision: plan.revision, status: plan.status,
    audioSlowUrl: plan.audioSlowUrl, audioNormalUrl: plan.audioNormalUrl, blocks };
}

function validateShape(blocks, publishing) {
  if (!Array.isArray(blocks) || blocks.length > 200) fail(400, 'blocks must be an array of at most 200 items');
  const keys = new Set();
  let previousPhase = -1;
  let activeKeyframes = 0;
  let fullStoryCount = 0;
  for (const [position, b] of blocks.entries()) {
    if (!b || typeof b !== 'object' || !TYPES.has(b.type) || !(b.phase in PHASES)) fail(400, `Invalid block at position ${position}`);
    if (b.position !== undefined && b.position !== position) fail(400, 'Positions must be unique and contiguous from zero');
    if (typeof b.blockKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.blockKey)) fail(400, 'Each block needs a UUID blockKey');
    if (b.active !== undefined && typeof b.active !== 'boolean') fail(400, 'active must be boolean');
    if (b.required !== undefined && typeof b.required !== 'boolean') fail(400, 'required must be boolean');
    if (keys.has(b.blockKey)) fail(400, 'Duplicate blockKey');
    keys.add(b.blockKey);
    if (PHASES[b.phase] < previousPhase) fail(400, 'Phase order must be before, during, after, later');
    previousPhase = PHASES[b.phase];
    if ((b.type === 'keyframe' && b.phase !== 'during') ||
      (b.type === 'expression' && !['before', 'later'].includes(b.phase)) ||
      (b.type === 'question' && !['during', 'after'].includes(b.phase)) ||
      ((b.type === 'full_story' || REINFORCEMENTS.has(b.type)) && b.phase !== 'after')) fail(400, `Invalid phase for ${b.type}`);
    if (b.type === 'keyframe' && b.active !== false) {
      activeKeyframes++;
      if (publishing && (typeof b.text !== 'string' || !b.text.trim())) fail(422, 'Active keyframes need text');
    }
    if (b.type === 'full_story' && b.active !== false) fullStoryCount++;
    if (b.type === 'question' && b.active !== false && publishing && !b.contextBlockKey) fail(422, 'Active questions need a keyframe context');
    if (b.type === 'expression' && b.active !== false && publishing && !validId(b.vocabularyId)) fail(422, 'Active expressions need vocabulary');
  }
  if (publishing && activeKeyframes < 1) fail(422, 'At least one active keyframe is required');
  if (publishing && fullStoryCount !== 1) fail(422, 'Exactly one active full_story block is required');
  const byKey = new Map(blocks.map((b, index) => [b.blockKey, { ...b, index }]));
  for (const b of blocks) {
    if (b.type !== 'question' || !b.contextBlockKey) continue;
    const context = byKey.get(b.contextBlockKey);
    if (!context || context.type !== 'keyframe' || context.active === false || context.index >= byKey.get(b.blockKey).index) fail(400, 'Question context must be an earlier active keyframe in this plan');
  }
}

async function validateReferences(story, blocks, publishing, transaction) {
  const questionIds = [...new Set(blocks.filter(b => b.type === 'question' && b.questionId).map(b => Number(b.questionId)))];
  const vocabularyIds = [...new Set(blocks.filter(b => b.type === 'expression' && b.vocabularyId).map(b => Number(b.vocabularyId)))];
  const revisitIds = [...new Set(blocks.filter(b => b.type === 'expression' && b.revisitStoryId).map(b => Number(b.revisitStoryId)))];
  const [questions, vocabulary, revisits] = await Promise.all([
    Question.findAll({ where: { id: { [Op.in]: questionIds }, storyId: story.id }, transaction }),
    Vocabulary.findAll({ where: { id: { [Op.in]: vocabularyIds } }, include: [{ model: Unit, as: 'unit' }], transaction }),
    Story.findAll({ where: { id: { [Op.in]: revisitIds } }, include: [{ model: Unit, as: 'unit' }], transaction })
  ]);
  if (questions.length !== questionIds.length) fail(400, 'Question must belong to this story');
  if (vocabulary.length !== vocabularyIds.length || vocabulary.some(v => v.unit.courseId !== story.unit.courseId)) fail(400, 'Vocabulary must belong to this course');
  if (revisits.length !== revisitIds.length || revisits.some(s => s.id === story.id || s.unit.courseId !== story.unit.courseId)) fail(400, 'Revisit story must be another story in this course');
  const questionMap = new Map(questions.map(q => [q.id, q]));
  const vocabularyMap = new Map(vocabulary.map(v => [v.id, v]));
  for (const b of blocks) {
    if (b.type === 'question' && b.active !== false && publishing && !validId(b.questionId)) fail(422, 'Active questions need a questionId');
    if (b.type === 'expression') {
      if (b.vocabularyRole && !['target', 'support', 'revisit'].includes(b.vocabularyRole)) fail(400, 'Invalid vocabularyRole');
      if (b.phase === 'later' && b.active !== false && publishing && (!validId(b.revisitStoryId) || b.vocabularyRole !== 'revisit')) fail(422, 'Later expressions need a revisit story and revisit role');
    }
    if (b.type === 'question' && questionMap.has(Number(b.questionId))) {
      const q = questionMap.get(Number(b.questionId));
      b.questionSnapshot = { questionText: q.questionText, answerType: q.answerType, options: q.options,
        correctAnswer: q.correctAnswer, audioUrl: q.audioUrl };
    }
    if (b.type === 'expression' && vocabularyMap.has(Number(b.vocabularyId))) {
      const v = vocabularyMap.get(Number(b.vocabularyId));
      b.vocabularySnapshot = { word: v.word, translation: v.translation, example: v.example,
        audioUrl: v.audioUrl, imageUrl: v.imageUrl, partOfSpeech: v.partOfSpeech };
    }
  }
}

const savedBlock = (planId, b, position) => ({
  planId, blockKey: b.blockKey, type: b.type, phase: b.phase, position,
  active: b.active !== false, required: b.required === true, text: b.type === 'keyframe' ? b.text || null : null,
  audioUrl: b.type === 'keyframe' ? b.audioUrl || null : null,
  questionId: b.type === 'question' ? b.questionId || null : null,
  contextBlockKey: b.type === 'question' ? b.contextBlockKey || null : null,
  vocabularyId: b.type === 'expression' ? b.vocabularyId || null : null,
  vocabularyRole: b.type === 'expression' ? b.vocabularyRole || 'target' : null,
  revisitStoryId: b.type === 'expression' ? b.revisitStoryId || null : null,
  questionSnapshot: b.type === 'question' ? b.questionSnapshot || null : null,
  vocabularySnapshot: b.type === 'expression' ? b.vocabularySnapshot || null : null
});

async function currentDraft(story, transaction) {
  let draft = await LessonPlan.findOne({ where: { storyId: story.id, status: 'draft' }, transaction, lock: transaction.LOCK.UPDATE });
  if (draft) return draft;
  const published = await LessonPlan.findOne({ where: { storyId: story.id, status: 'published' }, order: [['revision', 'DESC']], transaction });
  draft = await LessonPlan.create({ storyId: story.id, revision: published ? published.revision + 1 : 1, status: 'draft' }, { transaction });
  if (published) {
    const blocks = await LessonBlock.findAll({ where: { planId: published.id }, order: [['position', 'ASC']], transaction });
    await LessonBlock.bulkCreate(blocks.map(b => savedBlock(draft.id, b, b.position)), { transaction });
  } else {
    await LessonBlock.bulkCreate([
      savedBlock(draft.id, { blockKey: randomUUID(), type: 'keyframe', phase: 'during', text: story.text, active: true }, 0),
      savedBlock(draft.id, { blockKey: randomUUID(), type: 'full_story', phase: 'after', active: true }, 1)
    ], { transaction });
  }
  return draft;
}

async function stageRevisits(blocks, transaction) {
  const planned = blocks.filter(b => b.type === 'expression' && b.phase === 'later' && b.active);
  for (const b of planned) {
    const target = await Story.findByPk(b.revisitStoryId, { transaction, lock: transaction.LOCK.UPDATE });
    const draft = await currentDraft(target, transaction);
    const existing = await LessonBlock.findOne({ where: { planId: draft.id, type: 'expression',
      phase: 'before', vocabularyId: b.vocabularyId }, transaction });
    if (existing) continue;
    await LessonBlock.update({ position: sequelize.literal('position + 1') }, { where: { planId: draft.id }, transaction });
    await LessonBlock.create(savedBlock(draft.id, { blockKey: randomUUID(), type: 'expression', phase: 'before',
      vocabularyId: b.vocabularyId, vocabularyRole: 'revisit', active: true }, 0), { transaction });
  }
}

router.get('/story/:storyId/draft', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      return planDto(await planWithBlocks((await currentDraft(story, transaction)).id, transaction));
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.put('/story/:storyId/draft', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      const draft = await currentDraft(story, transaction);
      if (req.body.revision !== draft.revision) fail(409, 'Draft revision changed; reload it');
      const blocks = req.body.blocks;
      validateShape(blocks, false);
      await validateReferences(story, blocks, false, transaction);
      await LessonBlock.destroy({ where: { planId: draft.id }, transaction });
      await LessonBlock.bulkCreate(blocks.map((b, index) => savedBlock(draft.id, b, index)), { transaction });
      return planDto(await planWithBlocks(draft.id, transaction));
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.put('/story/:storyId/draft/reorder', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      const draft = await currentDraft(story, transaction);
      if (req.body.revision !== draft.revision) fail(409, 'Draft revision changed; reload it');
      const plan = await planWithBlocks(draft.id, transaction);
      const order = req.body.blockKeys;
      if (!Array.isArray(order) || order.length !== plan.blocks.length || new Set(order).size !== order.length ||
        order.some(key => !plan.blocks.some(b => b.blockKey === key))) fail(400, 'blockKeys must contain every draft block exactly once');
      const ordered = order.map((key, index) => ({ ...blockData(plan.blocks.find(b => b.blockKey === key)), position: index }));
      validateShape(ordered, false);
      // Positions are unique after the transaction; no partial reorder is visible.
      for (const [position, b] of ordered.entries()) await LessonBlock.update({ position }, { where: { planId: draft.id, blockKey: b.blockKey }, transaction });
      return planDto(await planWithBlocks(draft.id, transaction));
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.post('/story/:storyId/publish', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      const draft = await LessonPlan.findOne({ where: { storyId: story.id, status: 'draft' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!draft) fail(404, 'No draft to publish');
      if (req.body.revision !== draft.revision) fail(409, 'Draft revision changed; reload it');
      const plan = await planWithBlocks(draft.id, transaction);
      const blocks = plan.blocks.map(blockData);
      validateShape(blocks, true);
      await validateReferences(story, blocks, true, transaction);
      for (const b of blocks.filter(b => b.type === 'question' || b.type === 'expression')) await LessonBlock.update({
        questionSnapshot: b.questionSnapshot || null, vocabularySnapshot: b.vocabularySnapshot || null
      }, { where: { planId: draft.id, blockKey: b.blockKey }, transaction });
      const fullText = blocks.filter(b => b.type === 'keyframe' && b.active).map(b => b.text.trim()).join('\n\n');
      await draft.update({ status: 'published', audioSlowUrl: story.audioSlowUrl, audioNormalUrl: story.audioNormalUrl }, { transaction });
      await story.update({ text: fullText }, { transaction });
      const tooltips = await Tooltip.findAll({ where: { targetType: 'story', targetId: story.id, isActive: true }, transaction });
      for (const tooltip of tooltips) {
        if (fullText.substring(tooltip.startOffset, tooltip.endOffset) !== tooltip.selectedText) await tooltip.update({ isActive: false }, { transaction });
      }
      await stageRevisits(blocks, transaction);
      return planDto(await planWithBlocks(draft.id, transaction));
    });
    res.status(201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get('/story/:storyId', authMiddleware, isStudent, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const { story, enrollment } = await enrollmentForStory(req.params.storyId, req.user.id, transaction);
      let progress = await LessonProgress.findOne({ where: { enrollmentId: enrollment.id, storyId: story.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!progress) {
        const latest = await LessonPlan.findOne({ where: { storyId: story.id, status: 'published' }, order: [['revision', 'DESC']], transaction });
        if (!latest) fail(404, 'No published lesson for this story');
        progress = await LessonProgress.create({ enrollmentId: enrollment.id, storyId: story.id, planId: latest.id }, { transaction });
      }
      const plan = await planWithBlocks(progress.planId, transaction);
      if (!plan || plan.status !== 'published') fail(409, 'Assigned lesson revision is unavailable');
      const fullStoryText = plan.blocks.filter(b => b.type === 'keyframe' && b.active).map(b => b.text).join('\n\n');
      const answers = await LessonAnswer.findAll({ where: { lessonProgressId: progress.id }, order: [['attempt', 'ASC']], transaction });
      const reinforcements = await LessonReinforcement.findAll({ where: { lessonProgressId: progress.id }, transaction });
      return { ...planDto(plan, true), story: { id: story.id, title: story.title,
        fullStoryText, audioSlowUrl: plan.audioSlowUrl, audioNormalUrl: plan.audioNormalUrl },
        progress: { id: progress.id, lastBlockKey: progress.lastBlockKey, narrativeCompleted: progress.narrativeCompleted,
          answers: answers.map(a => ({ blockKey: a.blockKey, questionId: a.questionId, studentAnswer: a.studentAnswer, isCorrect: a.isCorrect, attempt: a.attempt })),
          reinforcements: reinforcements.map(r => ({ blockKey: r.blockKey, completed: r.completed })) } };
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

async function ownedProgress(id, userId, transaction) {
  if (!validId(id)) fail(400, 'Invalid progressId');
  const progress = await LessonProgress.findByPk(id, { include: [{ model: Enrollment, as: 'enrollment' }], transaction, lock: transaction.LOCK.UPDATE });
  if (!progress) fail(404, 'Lesson progress not found');
  if (progress.enrollment.studentId !== userId) fail(403, 'Not authorized for this progress');
  const plan = await planWithBlocks(progress.planId, transaction);
  if (!plan || plan.storyId !== progress.storyId || plan.status !== 'published') fail(409, 'Invalid assigned revision');
  return { progress, plan };
}

router.put('/progress/:progressId/current-block', authMiddleware, isStudent, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const { progress, plan } = await ownedProgress(req.params.progressId, req.user.id, transaction);
      const visitable = plan.blocks.filter(b => b.active && b.phase !== 'later');
      const targetIndex = visitable.findIndex(b => b.blockKey === req.body.blockKey);
      const currentIndex = visitable.findIndex(b => b.blockKey === progress.lastBlockKey);
      const block = visitable[targetIndex];
      if (!block || block.phase === 'later') fail(400, 'Block is not visitable in this revision');
      if (targetIndex > currentIndex + 1) fail(409, 'Visit preceding blocks first');
      await progress.update({ lastBlockKey: block.blockKey }, { transaction });
      return { id: progress.id, planId: plan.id, revision: plan.revision, lastBlockKey: progress.lastBlockKey, narrativeCompleted: progress.narrativeCompleted };
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.post('/progress/:progressId/answers', authMiddleware, isStudent, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const { progress, plan } = await ownedProgress(req.params.progressId, req.user.id, transaction);
      const { blockKey, questionId, studentAnswer } = req.body;
      const block = plan.blocks.find(b => b.blockKey === blockKey && b.type === 'question' && b.active);
      if (!block || block.questionId !== Number(questionId) || !block.questionSnapshot) fail(400, 'Question does not belong to this lesson revision');
      if (progress.lastBlockKey !== blockKey) fail(409, 'Visit this question block before answering');
      if (typeof studentAnswer !== 'string' || !studentAnswer.trim() || studentAnswer.length > 200) fail(400, 'studentAnswer must be 1 to 200 characters');
      const question = block.questionSnapshot;
      const isCorrect = question.answerType === 'open_ended' || normalized(studentAnswer) === normalized(question.correctAnswer);
      const attempt = await LessonAnswer.count({ where: { lessonProgressId: progress.id, blockKey }, transaction }) + 1;
      await LessonAnswer.create({ lessonProgressId: progress.id, blockKey, questionId: block.questionId,
        studentAnswer: studentAnswer.trim(), isCorrect, attempt }, { transaction });
      const context = plan.blocks.find(b => b.blockKey === block.contextBlockKey);
      return { blockKey, questionId: block.questionId, isCorrect, attempt,
        context: isCorrect ? null : { blockKey: context?.blockKey || null, text: context?.text || null },
        canRetry: true, canContinue: true };
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.post('/progress/:progressId/complete-narrative', authMiddleware, isStudent, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const { progress, plan } = await ownedProgress(req.params.progressId, req.user.id, transaction);
      const narrative = plan.blocks.filter(b => b.active && ['keyframe', 'question'].includes(b.type));
      const current = plan.blocks.find(b => b.blockKey === progress.lastBlockKey && b.active && b.phase !== 'later');
      if (!narrative.length || !current || current.position < narrative[narrative.length - 1].position) {
        fail(409, 'Visit the final narrative block before completing it');
      }
      await progress.update({ narrativeCompleted: true }, { transaction });
      return { id: progress.id, narrativeCompleted: true };
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.put('/progress/:progressId/reinforcements/:blockKey', authMiddleware, isStudent, async (req, res) => {
  try {
    const result = await sequelize.transaction(async transaction => {
      const { progress, plan } = await ownedProgress(req.params.progressId, req.user.id, transaction);
      const block = plan.blocks.find(b => b.blockKey === req.params.blockKey && b.active && REINFORCEMENTS.has(b.type));
      if (!block) fail(400, 'Reinforcement does not belong to this lesson revision');
      if (req.body.completed !== true) fail(400, 'completed must be true');
      const [record] = await LessonReinforcement.findOrCreate({ where: { lessonProgressId: progress.id, blockKey: block.blockKey },
        defaults: { completed: true }, transaction });
      if (!record.completed) await record.update({ completed: true }, { transaction });
      return { blockKey: block.blockKey, completed: true };
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

module.exports = router;
