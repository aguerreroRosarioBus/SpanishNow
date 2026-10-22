const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher, isStudent } = require('../middlewares/auth.middleware');
const sequelize = require('../config/database');
const { Story, Unit, Course, Enrollment, LessonPlan, LessonBlock, LessonProgress, LessonAnswer, LessonReinforcement, Tooltip } = require('../models');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const upload = require('../middlewares/upload.middleware');
const { REINFORCEMENTS, MAX_AUDIO_URL, fail, validId, planWithBlocks, blockData, draftTransaction, currentDraft,
  replaceDraftBlocks, publishDraft, validateShape } = require('../services/lessonPlanService');
const { ContentLockedError, assertUnitOpen, sendLocked } = require('../services/unitAvailability');

const sendError = (res, error) => (error instanceof ContentLockedError
  ? sendLocked(res, error)
  : res.status(error.status || 500).json({ error: error.message }));
const AUDIO_MIME = /^audio\//i;
const AUDIO_OTHER_MIME = new Set(['video/mp4', 'video/webm', 'application/ogg']);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const normalized = value => String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');


router.use((req, res, next) => {
  if (['PUT', 'POST'].includes(req.method) && !req.is('multipart/form-data') && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'A JSON object is required' });
  }
  next();
});

async function storyForTeacher(storyId, userId, transaction) {
  if (!validId(storyId)) fail(400, 'Invalid storyId');
  const story = await Story.findByPk(storyId, { include: [{ model: Unit, as: 'unit', include: [{ model: Course, as: 'course' }] }],
    ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}) });
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
  // Drip content: a unit that has not opened yet gives nothing (and creates no progress).
  await assertUnitOpen({ id: userId, role: 'student' }, story.unit, { enrollment });
  return { story, enrollment };
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

const tooltipDto = t => ({ id: t.id, startOffset: t.startOffset, endOffset: t.endOffset,
  selectedText: t.selectedText, tooltipContent: t.tooltipContent, isActive: t.isActive });

/**
 * Adds `tooltips` to every keyframe block.
 * Teacher: every tooltip of the keyframe (including inactive ones, so they can be cleaned up).
 * Student: only active tooltips whose selectedText still matches the text of the revision being shown.
 */
async function withKeyframeTooltips(dto, storyId, transaction, student = false) {
  const tooltips = await Tooltip.findAll({ where: { targetType: 'keyframe', targetId: storyId },
    order: [['startOffset', 'ASC'], ['id', 'ASC']], transaction });
  for (const block of dto.blocks) {
    if (block.type !== 'keyframe') continue;
    const own = tooltips.filter(t => t.blockKey === block.blockKey);
    block.tooltips = student
      ? own.filter(t => t.isActive && typeof block.text === 'string' && block.text.slice(t.startOffset, t.endOffset) === t.selectedText)
        .map(({ startOffset, endOffset, selectedText, tooltipContent }) => ({ startOffset, endOffset, selectedText, tooltipContent }))
      : own.map(tooltipDto);
  }
  return dto;
}

const draftDto = async (plan, transaction) => withKeyframeTooltips(planDto(plan), plan.storyId, transaction);

router.get('/story/:storyId/draft', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await draftTransaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      return draftDto(await planWithBlocks((await currentDraft(story, transaction)).id, transaction), transaction);
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.put('/story/:storyId/draft', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await draftTransaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      const draft = await currentDraft(story, transaction);
      if (req.body.revision !== draft.revision) fail(409, 'Draft revision changed; reload it');
      await replaceDraftBlocks(story, draft, req.body.blocks, transaction);
      return draftDto(await planWithBlocks(draft.id, transaction), transaction);
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

router.put('/story/:storyId/draft/reorder', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await draftTransaction(async transaction => {
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
      return draftDto(await planWithBlocks(draft.id, transaction), transaction);
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
});

// Audio of a keyframe. Only the draft is modified; publishing copies audioUrl with the block.
async function draftKeyframeBlock(story, blockKey, transaction, what = 'audio') {
  const draft = await currentDraft(story, transaction);
  const block = await LessonBlock.findOne({ where: { planId: draft.id, blockKey }, transaction, lock: transaction.LOCK.UPDATE });
  if (!block) fail(404, 'Block not found in the current draft');
  if (block.type !== 'keyframe') fail(400, `Only keyframe blocks can have ${what}`);
  return block;
}

// Rejects non-owners before buffering the file in memory.
const audioPrecheck = async (req, res, next) => {
  try {
    await storyForTeacher(req.params.storyId, req.user.id);
    next();
  } catch (error) { sendError(res, error); }
};

const audioUpload = (req, res, next) => upload.single('audio')(req, res, error => {
  if (!error) return next();
  res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message });
});

const audioRoute = '/story/:storyId/draft/blocks/:blockKey/audio';

router.post(audioRoute, authMiddleware, isTeacher, audioPrecheck, audioUpload, async (req, res) => {
  try {
    const { blockKey } = req.params;
    await draftTransaction(async transaction => {
      await draftKeyframeBlock(await storyForTeacher(req.params.storyId, req.user.id, transaction), blockKey, transaction);
    });
    const file = req.file;
    if (!file) fail(400, 'An audio file is required in the "audio" field');
    if (!AUDIO_MIME.test(file.mimetype) && !AUDIO_OTHER_MIME.has(file.mimetype)) fail(400, 'The file must be an audio file');
    let audioUrl;
    try {
      // Uploaded outside any DB transaction: a slow upload must not hold row locks.
      const result = await cloudinary.uploadFromBuffer(file.buffer, { folder: 'spanishnow/keyframes', resource_type: 'video' });
      audioUrl = result && result.secure_url;
    } catch (cloudinaryError) {
      console.warn('Cloudinary upload failed for keyframe audio:', cloudinaryError.message);
    }
    if (typeof audioUrl !== 'string' || !audioUrl || audioUrl.length > MAX_AUDIO_URL) fail(502, 'Audio upload failed; the keyframe was not modified');
    await draftTransaction(async transaction => {
      const block = await draftKeyframeBlock(await storyForTeacher(req.params.storyId, req.user.id, transaction), blockKey, transaction);
      await block.update({ audioUrl }, { transaction });
    });
    res.json({ blockKey, audioUrl });
  } catch (error) { sendError(res, error); }
});

router.delete(audioRoute, authMiddleware, isTeacher, async (req, res) => {
  try {
    await draftTransaction(async transaction => {
      const block = await draftKeyframeBlock(await storyForTeacher(req.params.storyId, req.user.id, transaction), req.params.blockKey, transaction);
      await block.update({ audioUrl: null }, { transaction });
    });
    res.json({ blockKey: req.params.blockKey, audioUrl: null });
  } catch (error) { sendError(res, error); }
});

// Illustration of a keyframe (uploaded image or exported drawing). Same rules as the audio: only the draft is modified,
// only keyframes, and imageUrl can only be written by this endpoint (the draft PUT preserves it).
const imageMulter = multer({
  storage: multer.memoryStorage(),
  // multer rejects a file that reaches the limit, so +1 keeps exactly 5 MB acceptable
  limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 },
  fileFilter: (req, file, cb) => IMAGE_MIME.has(file.mimetype) ? cb(null, true)
    : cb(new Error('The image must be PNG, JPEG, WebP or GIF'))
});

const imageUpload = (req, res, next) => imageMulter.single('image')(req, res, error => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The image is too large (maximum 5 MB)' });
  res.status(400).json({ error: error.message });
});

const imageRoute = '/story/:storyId/draft/blocks/:blockKey/image';

router.post(imageRoute, authMiddleware, isTeacher, audioPrecheck, imageUpload, async (req, res) => {
  try {
    const { blockKey } = req.params;
    await draftTransaction(async transaction => {
      await draftKeyframeBlock(await storyForTeacher(req.params.storyId, req.user.id, transaction), blockKey, transaction, 'an illustration');
    });
    const file = req.file;
    if (!file) fail(400, 'An image file is required in the "image" field');
    if (!IMAGE_MIME.has(file.mimetype)) fail(400, 'The image must be PNG, JPEG, WebP or GIF');
    let imageUrl;
    try {
      // Uploaded outside any DB transaction: a slow upload must not hold row locks.
      const result = await cloudinary.uploadFromBuffer(file.buffer, { folder: 'spanishnow/keyframes/images', resource_type: 'image' });
      imageUrl = result && result.secure_url;
    } catch (cloudinaryError) {
      console.warn('Cloudinary upload failed for keyframe image:', cloudinaryError.message);
    }
    if (typeof imageUrl !== 'string' || !imageUrl || imageUrl.length > MAX_AUDIO_URL) fail(502, 'Image upload failed; the keyframe was not modified');
    await draftTransaction(async transaction => {
      const block = await draftKeyframeBlock(await storyForTeacher(req.params.storyId, req.user.id, transaction), blockKey, transaction, 'an illustration');
      await block.update({ imageUrl }, { transaction });
    });
    res.json({ blockKey, imageUrl });
  } catch (error) { sendError(res, error); }
});

router.delete(imageRoute, authMiddleware, isTeacher, async (req, res) => {
  try {
    await draftTransaction(async transaction => {
      const block = await draftKeyframeBlock(await storyForTeacher(req.params.storyId, req.user.id, transaction), req.params.blockKey, transaction, 'an illustration');
      await block.update({ imageUrl: null }, { transaction });
    });
    res.json({ blockKey: req.params.blockKey, imageUrl: null });
  } catch (error) { sendError(res, error); }
});

router.post('/story/:storyId/publish', authMiddleware, isTeacher, async (req, res) => {
  try {
    const result = await draftTransaction(async transaction => {
      const story = await storyForTeacher(req.params.storyId, req.user.id, transaction);
      const published = await publishDraft(story, req.body.revision, transaction);
      return draftDto(published, transaction);
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
      const lessonDto = await withKeyframeTooltips(planDto(plan, true), story.id, transaction, true);
      return { ...lessonDto, story: { id: story.id, title: story.title,
        fullStoryText, audioSlowUrl: plan.audioSlowUrl, audioNormalUrl: plan.audioNormalUrl },
        progress: { id: progress.id, lastBlockKey: progress.lastBlockKey ?? null, narrativeCompleted: progress.narrativeCompleted,
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
  const story = await Story.findByPk(progress.storyId, { include: [{ model: Unit, as: 'unit' }], transaction });
  if (story) await assertUnitOpen({ id: userId, role: 'student' }, story.unit, { enrollment: progress.enrollment });
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