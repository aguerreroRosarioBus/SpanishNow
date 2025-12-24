const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Story, Unit, Course, Question } = require('../models');
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
    const { unitId, title, text, order } = req.body;

    const unit = await Unit.findByPk(unitId, {
      include: [{ model: Course, as: 'course' }]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    let audioSlowUrl = null;
    let audioNormalUrl = null;

    if (req.files['audioSlow']) {
      const result = await cloudinary.uploader.upload(req.files['audioSlow'][0].path, {
        folder: 'spanishnow/audio',
        resource_type: 'video'
      });
      audioSlowUrl = result.secure_url;
    }

    if (req.files['audioNormal']) {
      const result = await cloudinary.uploader.upload(req.files['audioNormal'][0].path, {
        folder: 'spanishnow/audio',
        resource_type: 'video'
      });
      audioNormalUrl = result.secure_url;
    }

    const story = await Story.create({
      unitId,
      title,
      text,
      audioSlowUrl,
      audioNormalUrl,
      order
    });

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

    const { title, text, order } = req.body;
    let audioSlowUrl = story.audioSlowUrl;
    let audioNormalUrl = story.audioNormalUrl;

    if (req.files['audioSlow']) {
      const result = await cloudinary.uploader.upload(req.files['audioSlow'][0].path, {
        folder: 'spanishnow/audio',
        resource_type: 'video'
      });
      audioSlowUrl = result.secure_url;
    }

    if (req.files['audioNormal']) {
      const result = await cloudinary.uploader.upload(req.files['audioNormal'][0].path, {
        folder: 'spanishnow/audio',
        resource_type: 'video'
      });
      audioNormalUrl = result.secure_url;
    }

    await story.update({ title, text, audioSlowUrl, audioNormalUrl, order });

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
