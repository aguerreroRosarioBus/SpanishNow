const express = require('express');
const router = express.Router();
const { Course, Unit, Story, User } = require('../models');
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
        { model: Unit, as: 'units', attributes: ['id', 'title', 'order'], include: [{ model: Story, as: 'stories', attributes: ['id', 'title', 'order'] }] }
      ],
      order: [
        [{ model: Unit, as: 'units' }, 'order', 'ASC'], [{ model: Unit, as: 'units' }, 'id', 'ASC'],
        [{ model: Unit, as: 'units' }, { model: Story, as: 'stories' }, 'order', 'ASC'],
        [{ model: Unit, as: 'units' }, { model: Story, as: 'stories' }, 'id', 'ASC']
      ]
    });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json({
      ...summary(course),
      salesDescription: course.salesDescription,
      units: course.units.map(unit => ({
        id: unit.id, title: unit.title, order: unit.order,
        stories: unit.stories.map(story => ({ id: story.id, title: story.title, order: story.order }))
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
