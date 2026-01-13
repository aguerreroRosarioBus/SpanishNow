const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { RepetitionActivity, Story, Unit, Course } = require('../models');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');

// Get repetition activities by story ID (public - for students)
router.get('/story/:storyId', async (req, res) => {
  try {
    const activities = await RepetitionActivity.findAll({
      where: { storyId: req.params.storyId },
      order: [['order', 'ASC']]
    });

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create repetition activity (teachers only, own courses)
router.post('/', authMiddleware, isTeacher, upload.single('audio'), async (req, res) => {
  try {
    const { storyId, phrase } = req.body;

    // Validate required fields
    if (!storyId || !phrase) {
      return res.status(400).json({
        error: 'Missing required fields: storyId, phrase'
      });
    }

    // Verify ownership: story → unit → course → teacherId
    const story = await Story.findByPk(storyId, {
      include: [{
        model: Unit,
        as: 'unit',
        include: [{
          model: Course,
          as: 'course',
          attributes: ['id', 'teacherId']
        }]
      }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to add activities to this story' });
    }

    // Calcular automáticamente el order basado en actividades existentes
    const existingActivities = await RepetitionActivity.count({ where: { storyId } });
    const order = existingActivities;

    let audioUrl = null;

    // Upload audio if provided
    if (req.file && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'spanishnow/repetition/audio',
          resource_type: 'video' // Cloudinary uses 'video' for audio files
        });
        audioUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary audio upload failed:', cloudinaryError.message);
      }
    }

    // Create repetition activity
    const activity = await RepetitionActivity.create({
      storyId,
      phrase,
      audioUrl,
      order
    });

    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update repetition activity (teachers only, own courses)
router.put('/:id', authMiddleware, isTeacher, upload.single('audio'), async (req, res) => {
  try {
    const activity = await RepetitionActivity.findByPk(req.params.id, {
      include: [{
        model: Story,
        as: 'story',
        include: [{
          model: Unit,
          as: 'unit',
          include: [{
            model: Course,
            as: 'course',
            attributes: ['id', 'teacherId']
          }]
        }]
      }]
    });

    if (!activity) {
      return res.status(404).json({ error: 'Repetition activity not found' });
    }

    // Verify ownership
    if (activity.story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this activity' });
    }

    const { phrase, order } = req.body;
    let audioUrl = activity.audioUrl;

    // Upload new audio if provided
    if (req.file && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'spanishnow/repetition/audio',
          resource_type: 'video'
        });
        audioUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary audio upload failed:', cloudinaryError.message);
      }
    }

    // Update activity
    const updateData = {};
    if (phrase !== undefined) updateData.phrase = phrase;
    if (audioUrl !== undefined) updateData.audioUrl = audioUrl;
    if (order !== undefined) updateData.order = order;

    await activity.update(updateData);

    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete repetition activity (teachers only, own courses)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const activity = await RepetitionActivity.findByPk(req.params.id, {
      include: [{
        model: Story,
        as: 'story',
        include: [{
          model: Unit,
          as: 'unit',
          include: [{
            model: Course,
            as: 'course',
            attributes: ['id', 'teacherId']
          }]
        }]
      }]
    });

    if (!activity) {
      return res.status(404).json({ error: 'Repetition activity not found' });
    }

    // Verify ownership
    if (activity.story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this activity' });
    }

    await activity.destroy();

    res.json({ message: 'Repetition activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
