const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Story, Unit, Course, Question, ActivityConfig } = require('../models');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');

// Get story by ID with questions
router.get('/:id', async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id, {
      include: [{ model: Question, as: 'questions' }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(story);
  } catch (error) {
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

    const unit = await Unit.findByPk(unitId, {
      include: [{ model: Course, as: 'course' }]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Calcular automáticamente el order basado en historias existentes en la unidad
    const existingStories = await Story.count({ where: { unitId } });
    const order = existingStories;

    let audioSlowUrl = null;
    let audioNormalUrl = null;

    // Solo subir a Cloudinary si está configurado
    if (req.files['audioSlow'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.files['audioSlow'][0].path, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioSlowUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioSlow, continuing without audio:', cloudinaryError.message);
      }
    }

    if (req.files['audioNormal'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.files['audioNormal'][0].path, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioNormalUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioNormal, continuing without audio:', cloudinaryError.message);
      }
    }

    const story = await Story.create({
      unitId,
      title,
      text,
      audioSlowUrl,
      audioNormalUrl,
      order
    });

    // Create default activity configurations for the new story
    const defaultActivities = [
      { storyId: story.id, activityType: 'flashcards', isEnabled: true, order: 0 },
      { storyId: story.id, activityType: 'questions', isEnabled: true, order: 1 },
      { storyId: story.id, activityType: 'matching', isEnabled: true, order: 2 },
      { storyId: story.id, activityType: 'listen_repeat', isEnabled: true, order: 3 }
    ];
    await ActivityConfig.bulkCreate(defaultActivities);

    res.status(201).json(story);
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

    const { title, text } = req.body;
    let audioSlowUrl = story.audioSlowUrl;
    let audioNormalUrl = story.audioNormalUrl;

    // Solo subir a Cloudinary si está configurado
    if (req.files['audioSlow'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.files['audioSlow'][0].path, {
          folder: 'spanishnow/audio',
          resource_type: 'video'
        });
        audioSlowUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed for audioSlow, continuing without audio:', cloudinaryError.message);
      }
    }

    if (req.files['audioNormal'] && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.files['audioNormal'][0].path, {
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

    await story.update(updateData);

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

    await story.destroy();
    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
