const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Unit, Course, Story, Vocabulary } = require('../models');

// Get unit by ID with stories and vocabulary
router.get('/:id', async (req, res) => {
  try {
    const unit = await Unit.findByPk(req.params.id, {
      include: [
        { model: Story, as: 'stories', order: [['order', 'ASC']] },
        { model: Vocabulary, as: 'vocabulary' }
      ]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(unit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create unit (teachers only)
router.post('/', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { courseId, title, description, order } = req.body;

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const unit = await Unit.create({ courseId, title, description, order });
    res.status(201).json(unit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update unit (teachers only)
router.put('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const unit = await Unit.findByPk(req.params.id, {
      include: [{ model: Course, as: 'course' }]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, order } = req.body;
    await unit.update({ title, description, order });

    res.json(unit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete unit (teachers only)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const unit = await Unit.findByPk(req.params.id, {
      include: [{ model: Course, as: 'course' }]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await unit.destroy();
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
