const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Course, Unit, Story, User, Material, UnitQuiz, Certificate } = require('../models');
const certificates = require('../services/certificateService');
const { SLUG_PATTERN } = require('../utils/slug');

const summary = course => ({
  id: course.id,
  slug: course.slug,
  title: course.title,
  description: course.description,
  level: course.level,
  imageUrl: course.imageUrl,
  price: course.price,
  currency: course.currency,
  teacher: { name: course.teacher ? course.teacher.name : null }
});

// Published courses (public, no login)
router.get('/courses', async (req, res) => {
  try {
    const courses = await Course.findAll({
      where: { isPublished: true },
      include: [{ model: User, as: 'teacher', attributes: ['name'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    });
    res.json(courses.map(summary));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales page of a published course, with its outline (titles only: no story text, no questions)
router.get('/courses/:slug', async (req, res) => {
  try {
    if (!SLUG_PATTERN.test(req.params.slug)) return res.status(404).json({ error: 'Course not found' });
    const course = await Course.findOne({
      where: { slug: req.params.slug, isPublished: true },
      include: [
        { model: User, as: 'teacher', attributes: ['name'] },
        { model: Unit, as: 'units', attributes: ['id', 'title', 'order'], include: [{ model: Story, as: 'stories', attributes: ['id', 'title', 'order', 'videoUrl'] }] }
      ],
      order: [
        [{ model: Unit, as: 'units' }, 'order', 'ASC'], [{ model: Unit, as: 'units' }, 'id', 'ASC'],
        [{ model: Unit, as: 'units' }, { model: Story, as: 'stories' }, 'order', 'ASC'],
        [{ model: Unit, as: 'units' }, { model: Story, as: 'stories' }, 'id', 'ASC']
      ]
    });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    // Only what the sales page needs: whether there is a video / quiz and how many PDFs, never their links.
    const withQuiz = new Set((await UnitQuiz.findAll({
      where: { unitId: { [Op.in]: course.units.map(unit => unit.id) }, isPublished: true }, attributes: ['unitId']
    })).map(quiz => quiz.unitId));
    res.json({
      ...summary(course),
      salesDescription: course.salesDescription,
      introVideoUrl: course.introVideoUrl,
      materialsCount: await Material.count({ where: { courseId: course.id } }),
      units: course.units.map(unit => ({
        id: unit.id, title: unit.title, order: unit.order, hasQuiz: withQuiz.has(unit.id),
        stories: unit.stories.map(story => ({ id: story.id, title: story.title, order: story.order, hasVideo: Boolean(story.videoUrl) }))
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Certificate verification (public: whoever holds the code can check it). The code is not guessable: 12 random characters.
async function findCertificate(req, res) {
  const code = certificates.normalizeCode(req.params.code);
  const certificate = code ? await Certificate.findOne({ where: { code } }) : null;
  if (!certificate) { res.status(404).json({ error: 'Certificate not found' }); return null; }
  return certificate;
}

router.get('/certificates/:code', async (req, res) => {
  try {
    const certificate = await findCertificate(req, res);
    if (certificate) res.json(certificates.publicShape(certificate));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/certificates/:code/pdf', async (req, res) => {
  try {
    const certificate = await findCertificate(req, res);
    if (!certificate) return;
    const pdf = await certificates.renderPdf(certificate);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${certificate.code}.pdf"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'private, max-age=300'
    });
    res.end(pdf);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
