const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Vocabulary, Unit, Course } = require('../models');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');

// Get vocabulary by unit ID (public - for students to view)
router.get('/unit/:unitId', async (req, res) => {
  try {
    const vocabulary = await Vocabulary.findAll({
      where: { unitId: req.params.unitId },
      order: [['createdAt', 'ASC']]
    });

    res.json(vocabulary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create vocabulary (teachers only, own courses)
router.post('/', authMiddleware, isTeacher, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), async (req, res) => {
  try {
    const { unitId, word, translation, example, partOfSpeech } = req.body;

    // Validate required fields
    if (!unitId || !word || !translation) {
      return res.status(400).json({
        error: 'Missing required fields: unitId, word, translation'
      });
    }

    // Verify ownership: unit → course → teacherId
    const unit = await Unit.findByPk(unitId, {
      include: [{
        model: Course,
        as: 'course',
        attributes: ['id', 'teacherId']
      }]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to add vocabulary to this unit' });
    }

    let audioUrl = null;
    let imageUrl = null;

    // Upload audio if provided
    if (req.files && req.files.audio && req.files.audio[0]) {
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          const result = await cloudinary.uploadFromBuffer(req.files.audio[0].buffer, {
            folder: 'spanishnow/vocabulary/audio',
            resource_type: 'video' // Cloudinary uses 'video' for audio files
          });
          audioUrl = result.secure_url;
        } catch (cloudinaryError) {
          console.warn('Cloudinary audio upload failed:', cloudinaryError.message);
        }
      }
    }

    // Upload image if provided
    if (req.files && req.files.image && req.files.image[0]) {
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          const result = await cloudinary.uploadFromBuffer(req.files.image[0].buffer, {
            folder: 'spanishnow/vocabulary/images'
          });
          imageUrl = result.secure_url;
        } catch (cloudinaryError) {
          console.warn('Cloudinary image upload failed:', cloudinaryError.message);
        }
      }
    }

    // Create vocabulary
    const vocabulary = await Vocabulary.create({
      unitId,
      word,
      translation,
      example: example || null,
      partOfSpeech: partOfSpeech || null,
      audioUrl,
      imageUrl
    });

    res.status(201).json(vocabulary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update vocabulary (teachers only, own courses)
router.put('/:id', authMiddleware, isTeacher, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), async (req, res) => {
  try {
    const vocabulary = await Vocabulary.findByPk(req.params.id, {
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

    if (!vocabulary) {
      return res.status(404).json({ error: 'Vocabulary not found' });
    }

    // Verify ownership
    if (vocabulary.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this vocabulary' });
    }

    const { word, translation, example, partOfSpeech } = req.body;
    let audioUrl = vocabulary.audioUrl;
    let imageUrl = vocabulary.imageUrl;

    // Upload new audio if provided
    if (req.files && req.files.audio && req.files.audio[0]) {
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          const result = await cloudinary.uploader.upload(req.files.audio[0].path, {
            folder: 'spanishnow/vocabulary/audio',
            resource_type: 'video'
          });
          audioUrl = result.secure_url;
        } catch (cloudinaryError) {
          console.warn('Cloudinary audio upload failed:', cloudinaryError.message);
        }
      }
    }

    // Upload new image if provided
    if (req.files && req.files.image && req.files.image[0]) {
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          const result = await cloudinary.uploadFromBuffer(req.files.image[0].buffer, {
            folder: 'spanishnow/vocabulary/images'
          });
          imageUrl = result.secure_url;
        } catch (cloudinaryError) {
          console.warn('Cloudinary image upload failed:', cloudinaryError.message);
        }
      }
    }

    // Update vocabulary
    await vocabulary.update({
      word: word || vocabulary.word,
      translation: translation || vocabulary.translation,
      example: example !== undefined ? example : vocabulary.example,
      partOfSpeech: partOfSpeech !== undefined ? partOfSpeech : vocabulary.partOfSpeech,
      audioUrl,
      imageUrl
    });

    res.json(vocabulary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete vocabulary (teachers only, own courses)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const vocabulary = await Vocabulary.findByPk(req.params.id, {
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

    if (!vocabulary) {
      return res.status(404).json({ error: 'Vocabulary not found' });
    }

    // Verify ownership
    if (vocabulary.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this vocabulary' });
    }

    await vocabulary.destroy();

    res.json({ message: 'Vocabulary deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
