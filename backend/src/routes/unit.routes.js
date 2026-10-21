const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Unit, Course, Story, Vocabulary } = require('../models');
const { canReadCourse } = require('../utils/courseAccess');
const { Op } = require('sequelize');
const materials = require('../services/materialService');
const { ContentLockedError, assertUnitOpen, sendLocked, parseReleaseFields } = require('../services/unitAvailability');

// Get unit by ID with stories and vocabulary (the course teacher or an enrolled student)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (!/^[1-9]\d{0,9}$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    const unit = await Unit.findByPk(req.params.id, {
      include: [
        { model: Story, as: 'stories', order: [['order', 'ASC']] },
        { model: Vocabulary, as: 'vocabulary' }
      ]
    });

    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    if (!(await canReadCourse(req.user, await Course.findByPk(unit.courseId)))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await assertUnitOpen(req.user, unit); // drip content: the stories and vocabulary of a closed unit stay closed

    res.json(unit);
  } catch (error) {
    if (error instanceof ContentLockedError) return sendLocked(res, error);
    res.status(500).json({ error: error.message });
  }
});

// Create unit (teachers only)
router.post('/', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { courseId, title, description } = req.body;
    const release = parseReleaseFields(req.body);
    if (release.error) return res.status(400).json({ error: release.error });

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Calcular automáticamente el order basado en unidades existentes
    const existingUnits = await Unit.count({ where: { courseId } });
    const order = existingUnits;

    const unit = await Unit.create({ courseId, title, description, order, ...release.values });
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
    const release = parseReleaseFields(req.body);
    if (release.error) return res.status(400).json({ error: release.error });
    const updateData = { ...release.values };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (order !== undefined) updateData.order = order;

    await unit.update(updateData);

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

    // PDFs of the unit and of its stories go with it (the rows by cascade, the files here).
    const storyIds = (await Story.findAll({ where: { unitId: unit.id }, attributes: ['id'] })).map(story => story.id);
    await materials.removeFilesWhere({ [Op.or]: [{ unitId: unit.id }, ...(storyIds.length ? [{ storyId: { [Op.in]: storyIds } }] : [])] });
    await unit.destroy();
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
