const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth, isTeacher } = require('../middlewares/auth.middleware');
const { UniqueConstraintError } = require('sequelize');
const { Course, Unit, User, Story, Question, RepetitionActivity, LessonPlan, Enrollment, Order } = require('../models');
const { canReadCourse } = require('../utils/courseAccess');
const { SLUG_PATTERN, MAX_LENGTH: MAX_SLUG } = require('../utils/slug');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');

const MAX_PRICE = 99999999; // cents; fits INTEGER and any Stripe amount

// Sales fields of the body (JSON or multipart strings). Returns { values } with the valid ones, or { error }.
function parseSalesFields(body = {}) {
  const values = {};
  const has = key => body[key] !== undefined;
  if (has('price')) {
    const price = typeof body.price === 'number' ? body.price : Number(String(body.price).trim());
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) return { error: 'price must be a whole number of cents between 0 and ' + MAX_PRICE };
    values.price = price;
  }
  if (has('currency')) {
    const currency = String(body.currency).trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) return { error: 'currency must be a 3-letter code such as usd' };
    values.currency = currency;
  }
  if (has('isPublished')) {
    const raw = body.isPublished;
    if (raw === true || raw === 'true' || raw === '1' || raw === 1) values.isPublished = true;
    else if (raw === false || raw === 'false' || raw === '0' || raw === 0) values.isPublished = false;
    else return { error: 'isPublished must be true or false' };
  }
  if (has('salesDescription')) {
    values.salesDescription = body.salesDescription === null || String(body.salesDescription).trim() === '' ? null : String(body.salesDescription);
  }
  if (has('slug')) {
    const slug = body.slug === null ? '' : String(body.slug).trim().toLowerCase();
    if (slug === '') values.slug = null; // regenerated from the title when saved
    else if (slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) return { error: 'slug may only contain lowercase letters, numbers and single hyphens' };
    else values.slug = slug;
  }
  return { values };
}

// Courses: students and anonymous callers see the published ones; a teacher sees their own (published or not).
router.get('/', optionalAuth, async (req, res) => {
  try {
    const where = req.user && req.user.role === 'teacher' ? { teacherId: req.user.id } : { isPublished: true };
    const courses = await Course.findAll({
      where,
      include: [{ model: User, as: 'teacher', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get course by ID with units and stories (the course teacher or an enrolled student; the sales page uses /api/public)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (!/^[1-9]\d{0,9}$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const course = await Course.findByPk(req.params.id, {
      include: [
        { model: User, as: 'teacher', attributes: ['id', 'name'] },
        {
          model: Unit,
          as: 'units',
          include: [
            {
              model: Story,
              as: 'stories',
              include: [
                { model: Question, as: 'questions', attributes: ['id', 'storyId', 'questionText', 'answerType', 'options', 'audioUrl'] },
                { model: RepetitionActivity, as: 'repetitionActivities' }
              ],
              order: [['order', 'ASC']]
            }
          ],
          order: [['order', 'ASC']]
        }
      ],
      order: [
        [{ model: Unit, as: 'units' }, 'order', 'ASC'],
        [{ model: Unit, as: 'units' }, { model: Story, as: 'stories' }, 'order', 'ASC']
      ]
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    if (!(await canReadCourse(req.user, course))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Una historia con plan de lección tiene el texto generado desde el compositor.
    const data = course.toJSON();
    const storyIds = data.units.flatMap(unit => unit.stories.map(story => story.id));
    const plans = storyIds.length
      ? await LessonPlan.findAll({ where: { storyId: storyIds }, attributes: ['storyId', 'status'], raw: true })
      : [];
    const planned = new Set(plans.map(plan => plan.storyId));
    const published = new Set(plans.filter(plan => plan.status === 'published').map(plan => plan.storyId));
    data.units.forEach(unit => unit.stories.forEach(story => {
      story.hasLessonPlan = planned.has(story.id);
      // Estado que ve el profesor en la gestión del curso: Publicada si tiene alguna revisión publicada.
      story.lessonStatus = published.has(story.id) ? 'published' : 'draft';
    }));
    data.enrollmentCount = await Enrollment.count({ where: { courseId: course.id } });
    res.json(data);
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
        const result = await cloudinary.uploadFromBuffer(req.file.buffer, {
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

    const sales = parseSalesFields(req.body);
    if (sales.error) return res.status(400).json({ error: sales.error });

    try {
      await course.update({ title, description, level, imageUrl, ...sales.values });
    } catch (error) {
      if (error instanceof UniqueConstraintError) return res.status(409).json({ error: 'That slug is already used by another course' });
      throw error;
    }

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

    if (await Order.count({ where: { courseId: course.id } })) {
      return res.status(409).json({ error: 'This course has orders and cannot be deleted. Unpublish it instead.' });
    }

    await course.destroy();

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
