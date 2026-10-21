// Teacher's materials (PDFs) of one of their courses: list and upload. Rename, delete and download live in material.routes.js.
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const pdfUpload = require('../middlewares/pdfUpload.middleware');
const { Course, Unit, Story, Material } = require('../models');
const materials = require('../services/materialService');

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

// Only paths under /:id/materials: the router shares the /api/courses prefix with the course routes.
router.use('/:id/materials', authMiddleware, isTeacher);

async function ownCourse(req, res) {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Course not found' }); return null; }
  const course = await Course.findByPk(req.params.id);
  if (!course) { res.status(404).json({ error: 'Course not found' }); return null; }
  if (course.teacherId !== req.user.id) { res.status(403).json({ error: 'Not authorized' }); return null; }
  return course;
}

router.get('/:id/materials', async (req, res) => {
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    const rows = await Material.findAll({ where: { courseId: course.id }, order: [['order', 'ASC'], ['id', 'ASC']] });
    res.json(rows.map(materials.present));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// multipart: file (PDF) + title + unitId? + storyId? (at most one of them, and it must belong to this course)
router.post('/:id/materials', async (req, res, next) => {
  // Ownership is checked before the file is read into memory.
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    req.course = course;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}, pdfUpload, async (req, res) => {
  try {
    const course = req.course;
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required (field "file")' });

    const given = key => req.body[key] !== undefined && req.body[key] !== null && String(req.body[key]).trim() !== '';
    if (given('unitId') && given('storyId')) return res.status(400).json({ error: 'A material belongs to a unit or to a story, not both' });
    let unitId = null; let storyId = null;
    if (given('unitId')) {
      if (!validId(String(req.body.unitId).trim())) return res.status(400).json({ error: 'Invalid unitId' });
      const unit = await Unit.findOne({ where: { id: Number(req.body.unitId), courseId: course.id }, attributes: ['id'] });
      if (!unit) return res.status(400).json({ error: 'The unit does not belong to this course' });
      unitId = unit.id;
    }
    if (given('storyId')) {
      if (!validId(String(req.body.storyId).trim())) return res.status(400).json({ error: 'Invalid storyId' });
      const story = await Story.findOne({ where: { id: Number(req.body.storyId) }, attributes: ['id'], include: [{ model: Unit, as: 'unit', attributes: [], where: { courseId: course.id } }] });
      if (!story) return res.status(400).json({ error: 'The story does not belong to this course' });
      storyId = story.id;
    }

    let title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) title = String(req.file.originalname || '').replace(/\.pdf$/i, '').trim();
    if (!title || title.length > 200) return res.status(400).json({ error: 'title is required (up to 200 characters)' });

    const stored = await materials.storePdf(req.file.buffer);
    const last = await Material.max('order', { where: { courseId: course.id, unitId, storyId } });
    const material = await Material.create({ courseId: course.id, unitId, storyId, title, order: last === null || last === undefined ? 0 : last + 1, ...stored });
    res.status(201).json(materials.present(material));
  } catch (error) {
    if (error instanceof materials.MaterialError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
