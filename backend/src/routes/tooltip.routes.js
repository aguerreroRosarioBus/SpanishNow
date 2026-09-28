const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Tooltip, Story, Question, User, Unit, Course } = require('../models');
const { Op } = require('sequelize');

// Get all tooltips for a story
router.get('/story/:storyId', async (req, res) => {
  try {
    const tooltips = await Tooltip.findAll({
      where: {
        targetType: 'story',
        targetId: req.params.storyId,
        isActive: true
      },
      order: [['startOffset', 'ASC']],
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }]
    });

    res.json(tooltips);
  } catch (error) {
    console.error('Error fetching story tooltips:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tooltips for a question
router.get('/question/:questionId', async (req, res) => {
  try {
    const tooltips = await Tooltip.findAll({
      where: {
        targetType: 'question',
        targetId: req.params.questionId,
        isActive: true
      },
      order: [['startOffset', 'ASC']],
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }]
    });

    res.json(tooltips);
  } catch (error) {
    console.error('Error fetching question tooltips:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new tooltip (teachers only)
router.post('/', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { targetType, targetId, startOffset, endOffset, selectedText, tooltipContent, highlightColor } = req.body;

    // Validate required fields
    if (!targetType || !targetId || startOffset === undefined || endOffset === undefined || !selectedText || !tooltipContent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate offsets
    if (startOffset < 0 || endOffset <= startOffset) {
      return res.status(400).json({ error: 'Invalid offsets' });
    }

    // Verify target exists and teacher has permission
    let target;
    if (targetType === 'story') {
      target = await Story.findByPk(targetId, {
        include: [{
          model: Unit,
          as: 'unit',
          include: [{ model: Course, as: 'course' }]
        }]
      });
      if (!target) {
        return res.status(404).json({ error: 'Story not found' });
      }
      if (target.unit.course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to add tooltips to this story' });
      }
    } else if (targetType === 'question') {
      target = await Question.findByPk(targetId, {
        include: [{
          model: Story,
          as: 'story',
          include: [{
            model: Unit,
            as: 'unit',
            include: [{ model: Course, as: 'course' }]
          }]
        }]
      });
      if (!target) {
        return res.status(404).json({ error: 'Question not found' });
      }
      if (target.story.unit.course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to add tooltips to this question' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid targetType. Must be "story" or "question"' });
    }

    // Validate selected text matches
    const actualText = targetType === 'story' ? target.text : target.questionText;
    const extractedText = actualText.substring(startOffset, endOffset);

    if (extractedText !== selectedText) {
      return res.status(400).json({
        error: 'Selected text does not match current content',
        expected: selectedText,
        actual: extractedText
      });
    }

    // Check for overlapping tooltips
    const overlapping = await Tooltip.findAll({
      where: {
        targetType,
        targetId,
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
      startOffset,
      endOffset,
      selectedText,
      tooltipContent,
      createdBy: req.user.id,
      highlightColor: highlightColor || 'yellow'
    });

    const createdTooltip = await Tooltip.findByPk(tooltip.id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }]
    });

    res.status(201).json(createdTooltip);
  } catch (error) {
    console.error('Error creating tooltip:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update tooltip (teachers only)
router.put('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const tooltip = await Tooltip.findByPk(req.params.id);

    if (!tooltip) {
      return res.status(404).json({ error: 'Tooltip not found' });
    }

    // Verify ownership via target
    let target;
    if (tooltip.targetType === 'story') {
      target = await Story.findByPk(tooltip.targetId, {
        include: [{
          model: Unit,
          as: 'unit',
          include: [{ model: Course, as: 'course' }]
        }]
      });
      if (!target || target.unit.course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to update this tooltip' });
      }
    } else {
      target = await Question.findByPk(tooltip.targetId, {
        include: [{
          model: Story,
          as: 'story',
          include: [{
            model: Unit,
            as: 'unit',
            include: [{ model: Course, as: 'course' }]
          }]
        }]
      });
      if (!target || target.story.unit.course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to update this tooltip' });
      }
    }

    const { tooltipContent, highlightColor } = req.body;

    // Only allow updating content and color, not position
    const updateData = {};
    if (tooltipContent !== undefined) updateData.tooltipContent = tooltipContent;
    if (highlightColor !== undefined) updateData.highlightColor = highlightColor;

    await tooltip.update(updateData);

    const updatedTooltip = await Tooltip.findByPk(tooltip.id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }]
    });

    res.json(updatedTooltip);
  } catch (error) {
    console.error('Error updating tooltip:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete tooltip (teachers only)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const tooltip = await Tooltip.findByPk(req.params.id);

    if (!tooltip) {
      return res.status(404).json({ error: 'Tooltip not found' });
    }

    // Verify ownership
    let target;
    if (tooltip.targetType === 'story') {
      target = await Story.findByPk(tooltip.targetId, {
        include: [{
          model: Unit,
          as: 'unit',
          include: [{ model: Course, as: 'course' }]
        }]
      });
      if (!target || target.unit.course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this tooltip' });
      }
    } else {
      target = await Question.findByPk(tooltip.targetId, {
        include: [{
          model: Story,
          as: 'story',
          include: [{
            model: Unit,
            as: 'unit',
            include: [{ model: Course, as: 'course' }]
          }]
        }]
      });
      if (!target || target.story.unit.course.teacherId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this tooltip' });
      }
    }

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
    const { targetType, targetId } = req.body;

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'Missing targetType or targetId' });
    }

    let target;
    if (targetType === 'story') {
      target = await Story.findByPk(targetId);
    } else if (targetType === 'question') {
      target = await Question.findByPk(targetId);
    } else {
      return res.status(400).json({ error: 'Invalid targetType' });
    }

    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }

    const actualText = targetType === 'story' ? target.text : target.questionText;
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
