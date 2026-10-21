const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Story, Unit, Course, Question, LessonPlan } = require('../models');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');
const { parseVideoField } = require('../utils/videoUrl');
const materials = require('../services/materialService');
const { ContentLockedError, assertUnitOpen, sendLocked } = require('../services/unitAvailability');

// Get story by ID with questions
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id, {
      include: [{ model: Unit, as: 'unit', include: [{ model: Course, as: 'course' }] }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const owner = req.user.role === 'teacher' && story.unit.course.teacherId === req.user.id;
    if (!owner) {
      const { Enrollment } = require('../models');
      const enrollment = req.user.role === 'student' && await Enrollment.findOne({
        where: { studentId: req.user.id, courseId: story.unit.courseId }
      });
      if (!enrollment) return res.status(403).json({ error: 'Not authorized' });
      await assertUnitOpen(req.user, story.unit, { enrollment }); // drip content
    }
    const questions = await Question.findAll({ where: { storyId: story.id },
      attributes: owner ? undefined : ['id', 'storyId', 'questionText', 'answerType', 'options', 'audioUrl'] });
    const { unit, ...data } = story.toJSON();
    res.json({ ...data, questions });
  } catch (error) {
    if (error instanceof ContentLockedError) return sendLocked(res, error);
    res.status(500).json({ error: error.message });
  }
});

// Create story with audio files (teachers only)
router.post('/', authMiddleware, isTeacher, upload.fields([
  { name: 'audioSlow', maxCount: 1 },
  { name: 'audioNormal', maxCount: 1 }
]), async (req, res) => {
  try {
    const { unitId, title, text } = req.body;

    // Validate required fields
    // text is optional: the lesson composer writes the story fragment by fragment (published text is rebuilt from the keyframes)
    if (!unitId || !title) {
      return res.status(400).json({
        error: 'Missing required fields: unitId, title',
        received: { unitId, title }
      });
    }
    if (text !== undefined && text !== null && typeof text !== 'string') {
      return res.status(400).json({ error: 'text must be a string' });
    }

    // Validate unitId is a valid number
    const parsedUnitId = parseInt(unitId, 10);
    if (isNaN(parsedUnitId)) {
      return res.status(400).json({
        error: 'unitId must be a valid number',
        received: unitId
      });
    }

    const unit = await Unit.findByPk(parsedUnitId, {
      include: [{ model: Course, as: 'course' }]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Calcular automáticamente el order basado en historias existentes en la unidad
    const existingStories = await Story.count({ where: { unitId: parsedUnitId } });
    const order = existingStories;

    let audioSlowUrl = null;
    let audioNormalUrl = null;

    // Solo subir a Cloudinary si está configurado
    if (req.files && req.files['audioSlow'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploadFromBuffer(req.files['audioSlow'][0].buffer, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioSlowUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioSlow, continuing without audio:', cloudinaryError.message);
      }
    }

    if (req.files && req.files['audioNormal'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploadFromBuffer(req.files['audioNormal'][0].buffer, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioNormalUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioNormal, continuing without audio:', cloudinaryError.message);
      }
    }

    const story = await Story.create({
      unitId: parsedUnitId,
      title,
      text: text || '',
      audioSlowUrl,
      audioNormalUrl,
      order
    });

    res.status(201).json(story);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update story order only (teachers only) - accepts JSON
router.patch('/:id/order', authMiddleware, isTeacher, async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id, {
      include: [{
        model: Unit,
        as: 'unit',
        include: [{ model: Course, as: 'course' }]
      }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { order } = req.body;
    if (order === undefined) {
      return res.status(400).json({ error: 'Order is required' });
    }

    await story.update({ order });
    res.json(story);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update story (teachers only)
router.put('/:id', authMiddleware, isTeacher, upload.fields([
  { name: 'audioSlow', maxCount: 1 },
  { name: 'audioNormal', maxCount: 1 }
]), async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id, {
      include: [{
        model: Unit,
        as: 'unit',
        include: [{ model: Course, as: 'course' }]
      }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, text, deleteAudioSlow, deleteAudioNormal } = req.body;
    const video = parseVideoField(req.body, 'videoUrl');
    if (video.error) return res.status(400).json({ error: video.error });

    // Once the story has a lesson plan (draft or published) its text is owned by the lesson (rebuilt from the keyframes on publish).
    if (text !== undefined && text !== story.text && await LessonPlan.count({ where: { storyId: story.id } }) > 0) {
      return res.status(409).json({ error: 'El texto de esta historia se genera desde la lección; edítalo en el compositor.' });
    }
    let audioSlowUrl = story.audioSlowUrl;
    let audioNormalUrl = story.audioNormalUrl;

    // Handle audio deletion
    if (deleteAudioSlow === 'true') {
      audioSlowUrl = null;
    }

    if (deleteAudioNormal === 'true') {
      audioNormalUrl = null;
    }

    // Solo subir a Cloudinary si está configurado
    if (req.files && req.files['audioSlow'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploadFromBuffer(req.files['audioSlow'][0].buffer, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioSlowUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioSlow, continuing without audio:', cloudinaryError.message);
      }
    }

    if (req.files && req.files['audioNormal'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploadFromBuffer(req.files['audioNormal'][0].buffer, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioNormalUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioNormal, continuing without audio:', cloudinaryError.message);
      }
    }

    const { order } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (text !== undefined) updateData.text = text;
    if (audioSlowUrl !== undefined) updateData.audioSlowUrl = audioSlowUrl;
    if (audioNormalUrl !== undefined) updateData.audioNormalUrl = audioNormalUrl;
    if (order !== undefined) updateData.order = order;
    if (!video.skip) updateData.videoUrl = video.value;

    await story.update(updateData);

    // Validate tooltips if text changed
    if (text !== undefined && text !== story.text) {
      const { Tooltip } = require('../models');
      const tooltips = await Tooltip.findAll({
        where: { targetType: 'story', targetId: story.id, isActive: true }
      });

      for (const tooltip of tooltips) {
        const extractedText = text.substring(tooltip.startOffset, tooltip.endOffset);
        if (extractedText !== tooltip.selectedText) {
          await tooltip.update({ isActive: false });
        }
      }
    }

    res.json(story);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete story (teachers only)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id, {
      include: [{
        model: Unit,
        as: 'unit',
        include: [{ model: Course, as: 'course' }]
      }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await materials.removeFilesWhere({ storyId: story.id });
    await story.destroy();
    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
