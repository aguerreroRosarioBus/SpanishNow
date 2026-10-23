const { randomUUID } = require('crypto');
const { Op, Transaction } = require('sequelize');
const sequelize = require('../config/database');
const { Story, Unit, Question, Vocabulary, LessonPlan, LessonBlock, Tooltip } = require('../models');

// Lesson-plan domain logic shared by the HTTP routes and the curated seeds (seeds/curated).
// Moved out of src/routes/lessonPlan.routes.js without changing behaviour.

const TYPES = new Set(['expression', 'keyframe', 'question', 'full_story', 'flashcards', 'matching', 'listen_repeat']);
const PHASES = { before: 0, during: 1, after: 2, later: 3 };
const REINFORCEMENTS = new Set(['flashcards', 'matching', 'listen_repeat']);
const fail = (status, message, code) => { const error = new Error(message); error.status = status; error.code = code; throw error; };
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const MAX_KEYFRAME_TEXT = 20000; // characters (<= 60000 UTF-8 bytes, fits the TEXT column)
const MAX_AUDIO_URL = 500; // lesson_blocks.audioUrl is VARCHAR(500)
const MAX_IMAGE_ALT = 300; // lesson_blocks.imageAlt is VARCHAR(300)
const MAX_DB_INT = 2147483647;

async function planWithBlocks(planId, transaction) {
  return LessonPlan.findByPk(planId, { include: [{ model: LessonBlock, as: 'blocks' }],
    order: [[{ model: LessonBlock, as: 'blocks' }, 'position', 'ASC']], transaction });
}

function blockData(block) {
  const b = block.toJSON ? block.toJSON() : block;
  const { id, planId, createdAt, updatedAt, ...publicFields } = b;
  return publicFields;
}

const isIdValue = value => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) && validId(value) && Number(value) <= MAX_DB_INT;

/** Rejects values that would overflow their column; only applied to client-written drafts. */
function validateLengths(blocks) {
  for (const [index, b] of blocks.entries()) {
    const label = `Block ${index + 1}`;
    if (b.text !== undefined && b.text !== null) {
      if (typeof b.text !== 'string') fail(400, `${label}: text must be a string`);
      if (b.type === 'keyframe' && b.text.length > MAX_KEYFRAME_TEXT) fail(400, `${label}: keyframe text is too long (maximum ${MAX_KEYFRAME_TEXT} characters)`);
    }
    if (b.audioUrl !== undefined && b.audioUrl !== null) {
      if (typeof b.audioUrl !== 'string') fail(400, `${label}: audioUrl must be a string`);
      if (b.audioUrl.length > MAX_AUDIO_URL) fail(400, `${label}: audioUrl is too long (maximum ${MAX_AUDIO_URL} characters)`);
    }
    if (b.imageAlt !== undefined && b.imageAlt !== null) {
      if (typeof b.imageAlt !== 'string') fail(400, `${label}: imageAlt must be a string`);
      if (b.imageAlt.length > MAX_IMAGE_ALT) fail(400, `${label}: imageAlt is too long (maximum ${MAX_IMAGE_ALT} characters)`);
    }
    for (const field of ['questionId', 'vocabularyId', 'revisitStoryId']) {
      if (b[field] && !isIdValue(b[field])) fail(400, `${label}: ${field} must be a positive integer`);
    }
  }
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
      if (publishing && (typeof b.text !== 'string' || !b.text.trim())) fail(422, 'Active keyframes need text', 'lesson_plan_incomplete');
    }
    if (b.type === 'full_story' && b.active !== false) fullStoryCount++;
    if (b.type === 'question' && b.active !== false && publishing && !b.contextBlockKey) fail(422, 'Active questions need a keyframe context', 'lesson_plan_incomplete');
    if (b.type === 'expression' && b.active !== false && publishing && !validId(b.vocabularyId)) fail(422, 'Active expressions need vocabulary', 'lesson_plan_incomplete');
  }
  if (publishing && activeKeyframes < 1) fail(422, 'At least one active keyframe is required', 'lesson_plan_incomplete');
  if (publishing && fullStoryCount !== 1) fail(422, 'Exactly one active full_story block is required', 'lesson_plan_incomplete');
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
    if (b.type === 'question' && b.active !== false && publishing && !validId(b.questionId)) fail(422, 'Active questions need a questionId', 'lesson_plan_incomplete');
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
  imageUrl: b.type === 'keyframe' ? b.imageUrl || null : null,
  imageAlt: b.type === 'keyframe' && typeof b.imageAlt === 'string' ? b.imageAlt.trim() || null : null,
  questionId: b.type === 'question' ? b.questionId || null : null,
  contextBlockKey: b.type === 'question' ? b.contextBlockKey || null : null,
  vocabularyId: b.type === 'expression' ? b.vocabularyId || null : null,
  vocabularyRole: b.type === 'expression' ? b.vocabularyRole || 'target' : null,
  revisitStoryId: b.type === 'expression' ? b.revisitStoryId || null : null,
  questionSnapshot: b.type === 'question' ? b.questionSnapshot || null : null,
  vocabularySnapshot: b.type === 'expression' ? b.vocabularySnapshot || null : null
});

/**
 * Transaction for anything that may create or publish a draft (currentDraft, publishDraft). READ COMMITTED because
 * currentDraft looks for a draft that often does not exist yet: under REPEATABLE READ that locking read takes a gap lock
 * on lesson_plan_story_revision, and two new stories at the end of the index share the same gap, so both inserts wait for
 * each other (deadlock). Under READ COMMITTED a locking read with no match takes no gap lock and still sees the latest
 * committed draft. Drafts of one story stay serialized by the lock on its story row, which every caller takes first.
 */
const draftTransaction = fn => sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, fn);

// The caller must hold the story row lock (SELECT ... FOR UPDATE) inside a draftTransaction.
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
      savedBlock(draft.id, { blockKey: randomUUID(), type: 'keyframe', phase: 'during', text: story.text && story.text.trim() ? story.text : null, active: true }, 0),
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

/** Validates and replaces the blocks of a draft (the body of PUT /story/:storyId/draft). */
async function replaceDraftBlocks(story, draft, blocks, transaction) {
  validateShape(blocks, false);
  validateLengths(blocks);
  await validateReferences(story, blocks, false, transaction);
  // imageUrl is only set by the image endpoint (uploaded files), never by the client body: keep what the draft already has.
  const current = await LessonBlock.findAll({ where: { planId: draft.id, type: 'keyframe' }, attributes: ['blockKey', 'imageUrl'], transaction });
  const images = new Map(current.map(b => [b.blockKey, b.imageUrl]));
  await LessonBlock.destroy({ where: { planId: draft.id }, transaction });
  await LessonBlock.bulkCreate(blocks.map((b, index) => savedBlock(draft.id, { ...b, imageUrl: images.get(b.blockKey) || null }, index)), { transaction });
}

/**
 * Publishes the story's draft (the body of POST /story/:storyId/publish).
 * `story` must be the locked Story row. Returns the published plan with its blocks.
 */
async function publishDraft(story, revision, transaction) {
  const draft = await LessonPlan.findOne({ where: { storyId: story.id, status: 'draft' }, transaction, lock: transaction.LOCK.UPDATE });
  if (!draft) fail(404, 'No draft to publish', 'lesson_plan_no_draft');
  if (revision !== draft.revision) fail(409, 'Draft revision changed; reload it', 'lesson_plan_revision_conflict');
  const plan = await planWithBlocks(draft.id, transaction);
  const blocks = plan.blocks.map(blockData);
  validateShape(blocks, true);
  await validateReferences(story, blocks, true, transaction);
  for (const b of blocks.filter(b => b.type === 'question' || b.type === 'expression')) await LessonBlock.update({
    questionSnapshot: b.questionSnapshot || null, vocabularySnapshot: b.vocabularySnapshot || null
  }, { where: { planId: draft.id, blockKey: b.blockKey }, transaction });
  // Persist trimmed keyframe text so the student's reader (which joins block texts) matches Story.text exactly.
  for (const b of blocks.filter(b => b.type === 'keyframe' && typeof b.text === 'string' && b.text !== b.text.trim())) {
    b.text = b.text.trim();
    await LessonBlock.update({ text: b.text }, { where: { planId: draft.id, blockKey: b.blockKey }, transaction });
  }
  const fullText = blocks.filter(b => b.type === 'keyframe' && b.active).map(b => b.text.trim()).join('\n\n');
  await draft.update({ status: 'published', audioSlowUrl: story.audioSlowUrl, audioNormalUrl: story.audioNormalUrl }, { transaction });
  await story.update({ text: fullText }, { transaction });
  const tooltips = await Tooltip.findAll({ where: { targetType: 'story', targetId: story.id, isActive: true }, transaction });
  for (const tooltip of tooltips) {
    if (fullText.substring(tooltip.startOffset, tooltip.endOffset) !== tooltip.selectedText) await tooltip.update({ isActive: false }, { transaction });
  }
  const publishedKeyframes = new Map(blocks.filter(b => b.type === 'keyframe' && b.active).map(b => [b.blockKey, b.text]));
  const keyframeTooltips = await Tooltip.findAll({ where: { targetType: 'keyframe', targetId: story.id, isActive: true }, transaction });
  for (const tooltip of keyframeTooltips) {
    const text = publishedKeyframes.get(tooltip.blockKey);
    if (typeof text !== 'string' || text.substring(tooltip.startOffset, tooltip.endOffset) !== tooltip.selectedText) await tooltip.update({ isActive: false }, { transaction });
  }
  await stageRevisits(blocks, transaction);
  return planWithBlocks(draft.id, transaction);
}

module.exports = {
  TYPES, PHASES, REINFORCEMENTS, MAX_AUDIO_URL, MAX_IMAGE_ALT, fail, validId,
  planWithBlocks, blockData, validateLengths, validateShape, validateReferences,
  savedBlock, draftTransaction, currentDraft, stageRevisits, replaceDraftBlocks, publishDraft
};
