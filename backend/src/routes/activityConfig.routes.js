const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { ActivityConfig, Unit, Course } = require('../models');

// GET - Obtener configuración de actividades para una unidad
router.get('/unit/:unitId', async (req, res) => {
  try {
    const configs = await ActivityConfig.findAll({
      where: { unitId: req.params.unitId },
      order: [['order', 'ASC']]
    });
    res.json(configs);
  } catch (error) {
    console.error('Error fetching activity configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Crear configuración de actividad para una unidad
router.post('/', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { unitId, activityType, isEnabled, order, requiredStoryIds } = req.body;

    // Verificar ownership
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
      return res.status(403).json({ error: 'Not authorized to modify this unit' });
    }

    const config = await ActivityConfig.create({
      unitId,
      activityType,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      order,
      requiredStoryIds: requiredStoryIds || []
    });

    res.status(201).json(config);
  } catch (error) {
    console.error('Error creating activity config:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Actualizar configuración (orden, habilitación, requisitos)
router.put('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { isEnabled, order, requiredStoryIds } = req.body;

    const config = await ActivityConfig.findByPk(req.params.id, {
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

    if (!config) {
      return res.status(404).json({ error: 'Activity config not found' });
    }

    if (config.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this config' });
    }

    const updateData = {};
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (order !== undefined) updateData.order = order;
    if (requiredStoryIds !== undefined) updateData.requiredStoryIds = requiredStoryIds;

    await config.update(updateData);
    res.json(config);
  } catch (error) {
    console.error('Error updating activity config:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Reordenar múltiples actividades (batch update)
router.put('/unit/:unitId/reorder', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { configs } = req.body; // [{ id, order }, { id, order }, ...]

    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({ error: 'Invalid configs array' });
    }

    // Verificar ownership
    const unit = await Unit.findByPk(req.params.unitId, {
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
      return res.status(403).json({ error: 'Not authorized to modify this unit' });
    }

    // Batch update - actualizar orden de todas las actividades
    await Promise.all(
      configs.map(c =>
        ActivityConfig.update(
          { order: c.order },
          { where: { id: c.id, unitId: req.params.unitId } }
        )
      )
    );

    // Devolver configuraciones actualizadas
    const updated = await ActivityConfig.findAll({
      where: { unitId: req.params.unitId },
      order: [['order', 'ASC']]
    });

    res.json(updated);
  } catch (error) {
    console.error('Error reordering activity configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Eliminar configuración de actividad
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const config = await ActivityConfig.findByPk(req.params.id, {
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

    if (!config) {
      return res.status(404).json({ error: 'Activity config not found' });
    }

    if (config.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this config' });
    }

    await config.destroy();
    res.json({ message: 'Activity config deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity config:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
