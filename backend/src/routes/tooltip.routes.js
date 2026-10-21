const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Tooltip, Story, Question, User, Unit, Course, LessonPlan, LessonBlock } = require('../models');
const { canReadCourse } = require('../utils/courseAccess');
const { ContentLockedError, assertUnitOpen, sendLocked } = require('../services/unitAvailability');
const { Op } = require('sequelize');

const TARGET_TYPES = ['story', 'question', 'keyframe'];
const MAX_SELECTED_TEXT = 1000;
const MAX_TOOLTIP_CONTENT = 2000;
const MAX_BLOCK_KEY = 64;
const MAX_DB_INT = 2147483647;
const COLORS_MAX = 20;

const creatorInclude = [{ model: User, as: 'creator', attributes: ['id', 'name'] }];
const courseInclude = [{ model: Unit, as: 'unit', include: [{ model: Course, as: 'course' }] }];
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= MAX_DB_INT;

/** Loads the target (story, question or the story of a keyframe) and the course it belongs to. */
async function resolveTarget(targetType, targetId) {
  if (!validId(targetId)) return null;
  if (targetType === 'story' || targetType === 'keyframe') {
    const target = await Story.findByPk(targetId, { include: courseInclude });
    return target ? { target, course: target.unit.course, unit: target.unit } : null;
  }
  if (targetType === 'question') {
    const target = await Question.findByPk(targetId, {
      include: [{ model: Story, as: 'story', include: courseInclude }]
    });
    return target ? { target, course: target.story.unit.course, unit: target.story.unit } : null;
  }
  return null;
}

/** The keyframe block of the story's current draft; `error` is set when it cannot be used. */
async function draftKeyframe(storyId, blockKey) {
  const draft = await LessonPlan.findOne({ where: { storyId, status: 'draft' } });
  if (!draft) return { error: { status: 404, message: 'Draft not found; open the story draft first' } };
  const block = await LessonBlock.findOne({ where: { planId: draft.id, blockKey } });
  if (!block) return { error: { status: 404, message: 'Block not found in the current draft' } };
  if (block.type !== 'keyframe') return { error: { status: 400, message: 'Block is not a keyframe' } };
  return { block };
}

const isInt = value => typeof value === 'number' && Number.isInteger(value);

function validateTooltipText({ selectedText, tooltipContent, highlightColor }, { requireSelected }) {
  if (requireSelected && (typeof selectedText !== 'string' || !selectedText)) return 'selectedText must be a non-empty string';
  if (requireSelected && selectedText.length > MAX_SELECTED_TEXT) return `selectedText must be at most ${MAX_SELECTED_TEXT} characters`;
  if (tooltipContent !== undefined) {
    if (typeof tooltipContent !== 'string' || !tooltipContent.trim()) return 'tooltipContent must be a non-empty string';
    if (tooltipContent.length > MAX_TOOLTIP_CONTENT) return `tooltipContent must be at most ${MAX_TOOLTIP_CONTENT} characters`;
  }
  if (highlightColor !== undefined && highlightColor !== null &&
    (typeof highlightColor !== 'string' || highlightColor.length > COLORS_MAX)) return `highlightColor must be at most ${COLORS_MAX} characters`;
  return null;
}

async function readTooltips(req, res, targetType, targetId, label) {
  const resolved = await resolveTarget(targetType, targetId);
  if (!resolved) return res.status(404).json({ error: `${label} not found` });
  if (!(await canReadCourse(req.user, resolved.course))) {
    return res.status(403).json({ error: `Not authorized to view tooltips of this ${label.toLowerCase()}` });
  }
  await assertUnitOpen(req.user, resolved.unit); // drip content
  const tooltips = await Tooltip.findAll({
    where: { targetType, targetId: Number(targetId), isActive: true },
    order: [['startOffset', 'ASC']],
    include: creatorInclude
  });
  return res.json(tooltips);
}

// Get all tooltips for a story (course teacher or enrolled student)
router.get('/story/:storyId', authMiddleware, async (req, res) => {
  try {
    await readTooltips(req, res, 'story', req.params.storyId, 'Story');
  } catch (error) {
    if (error instanceof ContentLockedError) return sendLocked(res, error);
    console.error('Error fetching story tooltips:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tooltips for a question (course teacher or enrolled student)
router.get('/question/:questionId', authMiddleware, async (req, res) => {
  try {
    await readTooltips(req, res, 'question', req.params.questionId, 'Question');
  } catch (error) {
    if (error instanceof ContentLockedError) return sendLocked(res, error);
    console.error('Error fetching question tooltips:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new tooltip (teachers only)
router.post('/', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { targetType, targetId, blockKey, startOffset, endOffset, selectedText, tooltipContent, highlightColor } = req.body || {};

    // Validate required fields
    if (!targetType || !targetId || startOffset === undefined || endOffset === undefined || !selectedText || !tooltipContent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType. Must be "story", "question" or "keyframe"' });
    }

    // Validate offsets
    if (!isInt(startOffset) || !isInt(endOffset) || startOffset < 0 || endOffset <= startOffset) {
      return res.status(400).json({ error: 'Invalid offsets' });
    }
    const textError = validateTooltipText({ selectedText, tooltipContent, highlightColor }, { requireSelected: true });
    if (textError) return res.status(400).json({ error: textError });
    if (targetType === 'keyframe' && (typeof blockKey !== 'string' || !blockKey || blockKey.length > MAX_BLOCK_KEY)) {
      return res.status(400).json({ error: 'blockKey is required for keyframe tooltips' });
    }

    // Verify target exists and teacher has permission
    const resolved = await resolveTarget(targetType, targetId);
    if (!resolved) {
      return res.status(404).json({ error: `${targetType === 'question' ? 'Question' : 'Story'} not found` });
    }
    if (resolved.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: `Not authorized to add tooltips to this ${targetType === 'question' ? 'question' : 'story'}` });
    }

    // Validate selected text matches
    let actualText;
    if (targetType === 'story') {
      actualText = resolved.target.text;
    } else if (targetType === 'question') {
      actualText = resolved.target.questionText;
    } else {
      const { block, error } = await draftKeyframe(resolved.target.id, blockKey);
      if (error) return res.status(error.status).json({ error: error.message });
      actualText = block.text || '';
    }
    const extractedText = actualText.substring(startOffset, endOffset);

    if (extractedText !== selectedText) {
      return res.status(400).json({
        error: 'Selected text does not match current content',
        expected: selectedText,
        actual: extractedText
      });
    }

    // Check for overlapping tooltips (within the same keyframe for keyframe tooltips)
    const overlapping = await Tooltip.findAll({
      where: {
        targetType,
        targetId,
        ...(targetType === 'keyframe' ? { blockKey } : {}),
        isActive: true,
        [Op.or]: [
          {
            // New tooltip starts inside existing
            startOffset: { [Op.lte]: startOffset },
            endOffset: { [Op.gt]: startOffset }
          },
          {
            // New tooltip ends inside existing
            startOffset: { [Op.lt]: endOffset },
            endOffset: { [Op.gte]: endOffset }
          },
          {
            // New tooltip contains existing
            startOffset: { [Op.gte]: startOffset },
            endOffset: { [Op.lte]: endOffset }
          }
        ]
      }
    });

    if (overlapping.length > 0) {
      return res.status(409).json({
        error: 'Tooltip overlaps with existing tooltip',
        conflicting: overlapping.map(t => ({
          id: t.id,
          startOffset: t.startOffset,
          endOffset: t.endOffset,
          selectedText: t.selectedText
        }))
      });
    }

    // Create tooltip
    const tooltip = await Tooltip.create({
      targetType,
      targetId,
      blockKey: targetType === 'keyframe' ? blockKey : null,
      startOffset,
      endOffset,
      selectedText,
      tooltipContent,
      createdBy: req.user.id,
      highlightColor: highlightColor || 'yellow'
    });

    const createdTooltip = await Tooltip.findByPk(tooltip.id, { include: creatorInclude });

    res.status(201).json(createdTooltip);
  } catch (error) {
    console.error('Error creating tooltip:', error);
    res.status(500).json({ error: error.message });
  }
});

/** Loads the tooltip and checks that the teacher owns its course; sends the error response otherwise. */
async function ownedTooltip(req, res, action) {
  const tooltip = await Tooltip.findByPk(req.params.id);
  if (!tooltip) {
    res.status(404).json({ error: 'Tooltip not found' });
    return null;
  }
  const resolved = await resolveTarget(tooltip.targetType, tooltip.targetId);
  if (!resolved || resolved.course.teacherId !== req.user.id) {
    res.status(403).json({ error: `Not authorized to ${action} this tooltip` });
    return null;
  }
  return tooltip;
}

// Update tooltip (teachers only)
router.put('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const tooltip = await ownedTooltip(req, res, 'update');
    if (!tooltip) return;

    const { tooltipContent, highlightColor } = req.body || {};
    const textError = validateTooltipText({ tooltipContent, highlightColor }, { requireSelected: false });
    if (textError) return res.status(400).json({ error: textError });

    // Only allow updating content and color, not position
    const updateData = {};
    if (tooltipContent !== undefined) updateData.tooltipContent = tooltipContent;
    if (highlightColor !== undefined) updateData.highlightColor = highlightColor;

    await tooltip.update(updateData);

    const updatedTooltip = await Tooltip.findByPk(tooltip.id, { include: creatorInclude });

    res.json(updatedTooltip);
  } catch (error) {
    console.error('Error updating tooltip:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete tooltip (teachers only)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const tooltip = await ownedTooltip(req, res, 'delete');
    if (!tooltip) return;

    await tooltip.destroy();
    res.json({ message: 'Tooltip deleted successfully' });
  } catch (error) {
    console.error('Error deleting tooltip:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate all tooltips for a target (useful after text edits)
router.post('/validate', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { targetType, targetId } = req.body || {};

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'Missing targetType or targetId' });
    }
    if (targetType !== 'story' && targetType !== 'question') {
      return res.status(400).json({ error: 'Invalid targetType' });
    }

    const resolved = await resolveTarget(targetType, targetId);
    if (!resolved) {
      return res.status(404).json({ error: 'Target not found' });
    }
    if (resolved.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to validate tooltips of this target' });
    }

    const actualText = targetType === 'story' ? resolved.target.text : resolved.target.questionText;
    const tooltips = await Tooltip.findAll({
      where: { targetType, targetId, isActive: true }
    });

    const validationResults = [];

    for (const tooltip of tooltips) {
      const extractedText = actualText.substring(tooltip.startOffset, tooltip.endOffset);
      const isValid = extractedText === tooltip.selectedText;

      if (!isValid) {
        await tooltip.update({ isActive: false });
      }

      validationResults.push({
        id: tooltip.id,
        isValid,
        expectedText: tooltip.selectedText,
        actualText: extractedText
      });
    }

    res.json({
      totalTooltips: tooltips.length,
      validTooltips: validationResults.filter(r => r.isValid).length,
      invalidTooltips: validationResults.filter(r => !r.isValid).length,
      results: validationResults
    });
  } catch (error) {
    console.error('Error validating tooltips:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
