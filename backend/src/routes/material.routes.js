// A material (PDF): download link for students and the course teacher; rename, reorder and delete for the teacher.
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Material, Course, Unit, Story } = require('../models');
const { canReadCourse } = require('../utils/courseAccess');
const materials = require('../services/materialService');
const { ContentLockedError, assertUnitOpen, sendLocked } = require('../services/unitAvailability');

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

// The link is short-lived and never stored: students get a fresh one each time they press "download".
router.get('/:id/download-url', authMiddleware, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Material not found' });
    const material = await Material.findByPk(req.params.id);
    if (!material) return res.status(404).json({ error: 'Material not found' });
    if (!(await canReadCourse(req.user, await Course.findByPk(material.courseId)))) return res.status(403).json({ error: 'Not authorized' });
    // Drip content: a PDF of a unit (or of one of its stories) is as closed as the unit. Course-level PDFs are never locked.
    if (material.unitId || material.storyId) {
      const unit = material.unitId
        ? await Unit.findByPk(material.unitId)
        : (await Story.findByPk(material.storyId, { include: [{ model: Unit, as: 'unit' }] }) || {}).unit;
      if (unit) await assertUnitOpen(req.user, unit);
    }
    res.set('Cache-Control', 'no-store');
    res.json(materials.downloadUrl(material));
  } catch (error) {
    if (error instanceof ContentLockedError) return sendLocked(res, error);
    res.status(500).json({ error: error.message });
  }
});

// Loads the material and checks the teacher owns its course. Answers the error itself and returns null when not.
async function ownMaterial(req, res) {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Material not found' }); return null; }
  const material = await Material.findByPk(req.params.id);
  if (!material) { res.status(404).json({ error: 'Material not found' }); return null; }
  const course = await Course.findByPk(material.courseId, { attributes: ['id', 'teacherId'] });
  if (!course || course.teacherId !== req.user.id) { res.status(403).json({ error: 'Not authorized' }); return null; }
  return material;
}

router.put('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const material = await ownMaterial(req, res);
    if (!material) return;
    const { title, order } = req.body || {};
    const values = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) return res.status(400).json({ error: 'title must be text of 1 to 200 characters' });
      values.title = title.trim();
    }
    if (order !== undefined) {
      if (!Number.isInteger(order) || order < 0 || order > 1000000) return res.status(400).json({ error: 'order must be a whole number between 0 and 1000000' });
      values.order = order;
    }
    await material.update(values);
    res.json(materials.present(material));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const material = await ownMaterial(req, res);
    if (!material) return;
    await material.destroy();
    await materials.removeFile(material);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
