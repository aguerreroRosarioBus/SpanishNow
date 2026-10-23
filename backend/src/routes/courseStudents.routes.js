// Teacher's view of the students of one of their courses: list, manual enrolment, removal and Hotmart CSV import.
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const csvUpload = require('../middlewares/csvUpload.middleware');
const sequelize = require('../config/database');
const { Op, fn, col } = require('sequelize');
const { Course, Enrollment, User, Unit, Story, LessonPlan, LessonProgress, LessonAnswer, LessonReinforcement, UnitQuizAttempt, Certificate } = require('../models');
const { normalizeEmail, isValidEmail } = require('../services/accounts');
const { grantAccess, sendInvitation, previewImport, applyImport, ImportError } = require('../services/studentImport');
const { IMPORT, errorBody, withErrorCodes } = require('../services/errorCodes');
router.use(withErrorCodes(IMPORT));

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

// Only paths under /:id/students: the router shares the /api/courses prefix with the public course routes.
router.use('/:id/students', authMiddleware, isTeacher);

// Loads :id and checks the teacher owns it. Answers the error itself and returns null when it does not.
async function ownCourse(req, res) {
  if (!validId(req.params.id)) { res.status(400).json({ error: 'Invalid course id' }); return null; }
  const course = await Course.findByPk(req.params.id);
  if (!course) { res.status(404).json({ error: 'Course not found' }); return null; }
  if (course.teacherId !== req.user.id) { res.status(403).json({ error: 'Not authorized' }); return null; }
  return course;
}

// Stories with a published lesson: the only ones a student can complete.
const totalStories = courseId => Story.count({
  distinct: true,
  include: [
    { model: Unit, as: 'unit', attributes: [], where: { courseId } },
    { model: LessonPlan, as: 'lessonPlans', attributes: [], where: { status: 'published' }, required: true }
  ]
});

// completed = stories whose narrative the student finished
async function completedByEnrollment(enrollmentIds) {
  if (!enrollmentIds.length) return new Map();
  const rows = await LessonProgress.findAll({
    where: { enrollmentId: { [Op.in]: enrollmentIds }, narrativeCompleted: true },
    attributes: ['enrollmentId', [fn('COUNT', fn('DISTINCT', col('storyId'))), 'completed']],
    group: ['enrollmentId'], raw: true
  });
  return new Map(rows.map(row => [row.enrollmentId, Number(row.completed)]));
}

const present = (enrollment, user, progress) => ({
  enrollmentId: enrollment.id,
  user: { id: user.id, name: user.name, email: user.email },
  source: enrollment.source,
  enrolledAt: enrollment.createdAt,
  progress
});

router.get('/:id/students', async (req, res) => {
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    const enrollments = await Enrollment.findAll({
      where: { courseId: course.id },
      include: [{ model: User, as: 'student', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    });
    const total = await totalStories(course.id);
    const completed = await completedByEnrollment(enrollments.map(e => e.id));
    res.json(enrollments.map(e => present(e, e.student, { completedStories: completed.get(e.id) || 0, totalStories: total })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual enrolment. Idempotent: an existing enrolment answers 200 with the same row.
router.post('/:id/students', async (req, res) => {
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    const email = normalizeEmail(req.body && req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
    const name = req.body && typeof req.body.name === 'string' ? req.body.name : '';

    const result = await grantAccess({ course, email, name, source: 'manual' });
    let invited = false;
    if (result.enrollmentCreated) {
      try {
        await sendInvitation({ course, teacherName: req.user.name.split(/\s+/)[0], user: result.user, userCreated: result.userCreated });
        invited = true;
      } catch (error) {
        console.error(`Invitation to ${result.user.email} failed:`, error.message);
      }
    }
    const completed = await completedByEnrollment([result.enrollment.id]);
    res.status(result.enrollmentCreated ? 201 : 200).json({
      ...present(result.enrollment, result.user, { completedStories: completed.get(result.enrollment.id) || 0, totalStories: await totalStories(course.id) }),
      created: result.enrollmentCreated,
      invited
    });
  } catch (error) {
    if (error instanceof ImportError) return res.status(error.status).json(errorBody(IMPORT, error.message, error.status));
    res.status(500).json({ error: error.message });
  }
});

// Removes access: deletes the enrolment and the student's progress in it.
router.delete('/:id/students/:enrollmentId', async (req, res) => {
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    if (!validId(req.params.enrollmentId)) return res.status(400).json({ error: 'Invalid enrollmentId' });

    const removed = await sequelize.transaction(async transaction => {
      const enrollment = await Enrollment.findOne({ where: { id: req.params.enrollmentId, courseId: course.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!enrollment) return false;
      const rows = await LessonProgress.findAll({ where: { enrollmentId: enrollment.id }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
      const ids = rows.map(row => row.id);
      if (ids.length) {
        await LessonAnswer.destroy({ where: { lessonProgressId: ids }, transaction });
        await LessonReinforcement.destroy({ where: { lessonProgressId: ids }, transaction });
        await LessonProgress.destroy({ where: { id: ids }, transaction });
      }
      await UnitQuizAttempt.destroy({ where: { enrollmentId: enrollment.id }, transaction });
      await Certificate.destroy({ where: { enrollmentId: enrollment.id }, transaction });
      await enrollment.destroy({ transaction });
      return true;
    });
    if (!removed) return res.status(404).json({ error: 'Enrollment not found' });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const wantsInvites = value => value === true || ['true', '1', 'on', 'yes'].includes(String(value).toLowerCase());

router.post('/:id/students/import/preview', csvUpload, async (req, res) => {
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    if (!req.file) return res.status(400).json({ error: 'A CSV file is required (field "file")' });
    res.json(await previewImport(course.id, req.file.buffer));
  } catch (error) {
    if (error instanceof ImportError) return res.status(error.status).json(errorBody(IMPORT, error.message, error.status));
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/students/import', csvUpload, async (req, res) => {
  try {
    const course = await ownCourse(req, res);
    if (!course) return;
    if (!req.file) return res.status(400).json({ error: 'A CSV file is required (field "file")' });
    res.json(await applyImport(course, req.file.buffer, { sendInvites: wantsInvites(req.body && req.body.sendInvites) }));
  } catch (error) {
    if (error instanceof ImportError) return res.status(error.status).json(errorBody(IMPORT, error.message, error.status));
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
