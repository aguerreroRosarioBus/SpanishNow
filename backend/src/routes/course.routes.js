const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth, isTeacher } = require('../middlewares/auth.middleware');
const { UniqueConstraintError } = require('sequelize');
const { Course, Unit, User, Story, Question, RepetitionActivity, LessonPlan, Enrollment, Order, Material, Coupon } = require('../models');
const { canReadCourse } = require('../utils/courseAccess');
const { SLUG_PATTERN, MAX_LENGTH: MAX_SLUG } = require('../utils/slug');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');
const { parseVideoField } = require('../utils/videoUrl');
const materialService = require('../services/materialService');
const quizService = require('../services/quizService');
const commentService = require('../services/commentService');
const drip = require('../services/unitAvailability');

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

// Series fields of the body: nextCourseId (a course of the same teacher, not this one) and nextCourseCouponId (a coupon of the
// same teacher that applies to that next course). Blank/null clears them; without a next course there is no coupon.
// Returns { values } with the columns to update ({} when the body has neither field) or { error }.
async function parseSeriesFields(body, course) {
  const has = key => body[key] !== undefined;
  if (!has('nextCourseId') && !has('nextCourseCouponId')) return { values: {} };
  const readId = (key, label) => {
    const raw = body[key];
    if (raw === null || raw === '' || raw === 'null') return { id: null };
    if (!/^[1-9]\d{0,9}$/.test(String(raw)) || Number(raw) > 2147483647) return { error: `${label} is not valid` };
    return { id: Number(raw) };
  };

  let nextId = course.nextCourseId;
  let couponId = course.nextCourseCouponId;
  if (has('nextCourseId')) {
    const read = readId('nextCourseId', 'nextCourseId');
    if (read.error) return read;
    nextId = read.id;
  }
  if (has('nextCourseCouponId')) {
    const read = readId('nextCourseCouponId', 'nextCourseCouponId');
    if (read.error) return read;
    couponId = read.id;
  }
  if (nextId === course.id) return { error: 'A course cannot be its own next course' };
  if (nextId !== null) {
    const next = await Course.findByPk(nextId, { attributes: ['id', 'teacherId'] });
    if (!next || next.teacherId !== course.teacherId) return { error: 'nextCourseId must be one of your courses' };
  } else {
    couponId = null;
  }
  if (couponId !== null) {
    const coupon = await Coupon.findByPk(couponId, { attributes: ['id', 'teacherId', 'courseId'] });
    if (!coupon || coupon.teacherId !== course.teacherId) return { error: 'nextCourseCouponId must be one of your coupons' };
    if (coupon.courseId !== null && coupon.courseId !== nextId) return { error: 'That coupon only applies to a different course than the next course' };
  }
  return { values: { nextCourseId: nextId, nextCourseCouponId: couponId } };
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

    // PDFs by place (course, unit, story) without their storage link, and the quiz summary of each unit.
    // The teacher also sees quizzes in draft (isPublished: false); a student only the published ones.
    const files = await Material.findAll({ where: { courseId: course.id }, order: [['order', 'ASC'], ['id', 'ASC']] });
    const pick = predicate => files.filter(predicate).map(materialService.present);
    data.materials = pick(m => m.unitId === null && m.storyId === null);
    const isOwner = req.user.role === 'teacher';
    const quizzes = await quizService.summariesByUnit(data.units.map(unit => unit.id), { includeDrafts: isOwner });
    data.units.forEach(unit => {
      unit.materials = pick(m => m.unitId === unit.id);
      unit.quiz = quizzes.get(unit.id) || null;
      unit.stories.forEach(story => { story.materials = pick(m => m.storyId === story.id); });
    });

    // Comments per story (the teacher counts all, a student the visible ones) and drip content: a student gets locked/availableAt
    // per unit, and the stories of a closed unit keep only their title and order (no text, audio, video, questions, PDFs or quiz).
    const commentCounts = await commentService.countByStory(storyIds, { includeHidden: isOwner });
    const enrollment = isOwner ? null : await Enrollment.findOne({ where: { studentId: req.user.id, courseId: course.id } });
    data.units.forEach(unit => {
      const state = isOwner ? { locked: false, availableAt: null } : drip.unitAvailability(unit, enrollment);
      Object.assign(unit, drip.present(state));
      unit.stories.forEach(story => { story.commentCount = commentCounts.get(story.id) || 0; });
      if (state.locked) {
        unit.materials = [];
        unit.quiz = null;
        unit.stories = unit.stories.map(story => ({
          id: story.id, unitId: story.unitId, title: story.title, order: story.order,
          hasLessonPlan: story.hasLessonPlan, lessonStatus: story.lessonStatus,
          materials: [], questions: [], repetitionActivities: [], commentCount: 0
        }));
      }
    });
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

    if (req.file) {
      if (!cloudinary.canUpload()) return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado.' });
      try {
        const result = await cloudinary.uploadFromBuffer(req.file.buffer, { folder: 'spanishnow/courses', resource_type: 'image' });
        if (!result?.secure_url) throw new Error('Missing image URL');
        imageUrl = result.secure_url;
      } catch {
        return res.status(502).json({ error: 'No se pudo guardar la imagen. El curso no fue modificado.' });
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

    const sales = parseSalesFields(req.body);
    if (sales.error) return res.status(400).json({ error: sales.error });
    const intro = parseVideoField(req.body, 'introVideoUrl');
    if (intro.error) return res.status(400).json({ error: intro.error });
    const series = await parseSeriesFields(req.body || {}, course);
    if (series.error) return res.status(400).json({ error: series.error });

    if (req.file) {
      if (!cloudinary.canUpload()) return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado.' });
      try {
        const result = await cloudinary.uploadFromBuffer(req.file.buffer, { folder: 'spanishnow/courses', resource_type: 'image' });
        if (!result?.secure_url) throw new Error('Missing image URL');
        imageUrl = result.secure_url;
      } catch {
        return res.status(502).json({ error: 'No se pudo guardar la imagen. El curso no fue modificado.' });
      }
    }

    try {
      await course.update({ title, description, level, imageUrl, ...sales.values, ...series.values, ...(intro.skip ? {} : { introVideoUrl: intro.value }) });
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

    await materialService.removeFilesWhere({ courseId: course.id });
    await course.destroy();

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
