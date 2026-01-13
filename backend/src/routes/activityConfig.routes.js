const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { ActivityConfig, Story, Unit, Course } = require('../models');

// GET - Obtener configuración de actividades para una historia
router.get('/story/:storyId', async (req, res) => {
  try {
    const configs = await ActivityConfig.findAll({
      where: { storyId: req.params.storyId },
      order: [['order', 'ASC']]
    });
    res.json(configs);
  } catch (error) {
    console.error('Error fetching activity configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Crear configuración de actividad (generalmente llamado automáticamente al crear historia)
router.post('/', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { storyId, activityType, isEnabled, order } = req.body;

    // Verificar ownership
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
      return res.status(403).json({ error: 'Not authorized to modify this story' });
    }

    const config = await ActivityConfig.create({
      storyId,
      activityType,
      isEnabled,
      order
    });

    res.status(201).json(config);
  } catch (error) {
    console.error('Error creating activity config:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Actualizar configuración (usado para habilitar/deshabilitar actividades)
router.put('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { isEnabled, order } = req.body;

    const config = await ActivityConfig.findByPk(req.params.id, {
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

    if (!config) {
      return res.status(404).json({ error: 'Activity config not found' });
    }

    if (config.story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to modify this config' });
    }

    await config.update({ isEnabled, order });
    res.json(config);
  } catch (error) {
    console.error('Error updating activity config:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Reordenar múltiples actividades (batch update)
router.put('/story/:storyId/reorder', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { configs } = req.body; // [{ id, order }, { id, order }, ...]

    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({ error: 'Invalid configs array' });
    }

    // Verificar ownership
    const story = await Story.findByPk(req.params.storyId, {
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
      return res.status(403).json({ error: 'Not authorized to modify this story' });
    }

    // Batch update - actualizar orden de todas las actividades
    await Promise.all(
      configs.map(c =>
        ActivityConfig.update(
          { order: c.order },
          { where: { id: c.id, storyId: req.params.storyId } }
        )
      )
    );

    // Devolver configuraciones actualizadas
    const updated = await ActivityConfig.findAll({
      where: { storyId: req.params.storyId },
      order: [['order', 'ASC']]
    });

    res.json(updated);
  } catch (error) {
    console.error('Error reordering activity configs:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Eliminar configuración de actividad (normalmente no se usa, se deshabilita en su lugar)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const config = await ActivityConfig.findByPk(req.params.id, {
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

    if (!config) {
      return res.status(404).json({ error: 'Activity config not found' });
    }

    if (config.story.unit.course.teacherId !== req.user.id) {
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
