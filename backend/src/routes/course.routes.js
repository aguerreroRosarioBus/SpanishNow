const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Course, Unit, User } = require('../models');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');

// Get all courses
router.get('/', async (req, res) => {
  try {
    const courses = await Course.findAll({
      include: [{ model: User, as: 'teacher', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get course by ID with units
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: [
        { model: User, as: 'teacher', attributes: ['id', 'name'] },
        { model: Unit, as: 'units', order: [['order', 'ASC']] }
      ]
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create course (teachers only)
router.post('/', authMiddleware, isTeacher, upload.single('image'), async (req, res) => {
  try {
    const { title, description, level } = req.body;
    let imageUrl = null;

    // Solo subir a Cloudinary si está configurado y hay archivo
    if (req.file && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'spanishnow/courses'
        });
        imageUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary upload failed, continuing without image:', cloudinaryError.message);
        // Continuar sin imagen si Cloudinary falla
      }
    }

    const course = await Course.create({
      title,
      description,
      level,
      teacherId: req.user.id,
      imageUrl
    });

    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update course (teachers only, own courses)
router.put('/:id', authMiddleware, isTeacher, upload.single('image'), async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, level } = req.body;
    let imageUrl = course.imageUrl;

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'spanishnow/courses'
      });
      imageUrl = result.secure_url;
    }

    await course.update({ title, description, level, imageUrl });

    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete course (teachers only, own courses)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await course.destroy();

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
