const express = require('express');
const router = express.Router();
const { authMiddleware, isStudent } = require('../middlewares/auth.middleware');
const sequelize = require('../config/database');
const { UniqueConstraintError } = require('sequelize');
const { Enrollment, Course, Story, Unit, LessonPlan, LessonBlock, LessonProgress, LessonAnswer, LessonReinforcement, UnitQuizAttempt } = require('../models');
const certificates = require('../services/certificateService');
const { nextCourseOffer } = require('../services/seriesService');
const drip = require('../services/unitAvailability');

const REINFORCEMENTS = ['flashcards', 'matching', 'listen_repeat'];
const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

// Get student enrollments with full course details and lesson progress
router.get('/my-courses', authMiddleware, isStudent, async (req, res) => {
  try {
    const enrollments = await Enrollment.findAll({
      where: { studentId: req.user.id },
      include: [
        {
          model: Course,
          as: 'course',
          include: [
            {
              model: Unit,
              as: 'units',
              include: [{ model: Story, as: 'stories' }]
            }
          ]
        },
        {
          model: LessonProgress,
          as: 'lessonProgress',
          attributes: ['storyId', 'planId', 'narrativeCompleted']
        }
      ]
    });

    // Drip content: a closed unit lists its stories (title and order) but not their content.
    const result = enrollments.map(row => {
      const data = row.toJSON();
      for (const unit of data.course ? data.course.units : []) {
        const state = drip.unitAvailability(unit, row);
        Object.assign(unit, drip.present(state));
        if (state.locked) unit.stories = unit.stories.map(story => ({ id: story.id, unitId: story.unitId, title: story.title, order: story.order }));
      }
      return data;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enroll in a course
router.post('/', authMiddleware, isStudent, async (req, res) => {
  try {
    const { courseId } = req.body;

    // Free enrolment is for published courses at price 0. A paid course is bought (POST /api/checkout) or granted by its teacher.
    const course = validId(courseId) ? await Course.findByPk(courseId) : null;
    if (!course || !course.isPublished) {
      return res.status(404).json({ error: 'Course not found' });
    }
    if (course.price > 0) {
      return res.status(402).json({ error: 'This course must be purchased', checkoutRequired: true, slug: course.slug });
    }

    const existingEnrollment = await Enrollment.findOne({
      where: { studentId: req.user.id, courseId }
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    const enrollment = await Enrollment.create({
      studentId: req.user.id,
      courseId: course.id,
      source: 'free'
    });

    res.status(201).json(enrollment);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Reset course progress: removes the student's lesson progress, answers and reinforcements for this enrollment.
// The next time the student opens a story they receive the currently published revision.
router.delete('/:enrollmentId/reset-progress', authMiddleware, isStudent, async (req, res) => {
  try {
    if (!validId(req.params.enrollmentId)) return res.status(400).json({ error: 'Invalid enrollmentId' });

    const deleted = await sequelize.transaction(async transaction => {
      // The enrollment row lock serializes this reset with the lesson endpoints (which lock it too).
      const enrollment = await Enrollment.findByPk(req.params.enrollmentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!enrollment) return { status: 404, error: 'Enrollment not found' };
      if (enrollment.studentId !== req.user.id) return { status: 403, error: 'Not authorized' };

      // Quiz attempts are progress too. An issued certificate is kept: the enrolment still exists.
      const quizAttempts = await UnitQuizAttempt.destroy({ where: { enrollmentId: enrollment.id }, transaction });
      const rows = await LessonProgress.findAll({ where: { enrollmentId: enrollment.id }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
      const ids = rows.map(row => row.id);
      if (!ids.length) return { counts: { progress: 0, answers: 0, reinforcements: 0, quizAttempts } };

      const answers = await LessonAnswer.destroy({ where: { lessonProgressId: ids }, transaction });
      const reinforcements = await LessonReinforcement.destroy({ where: { lessonProgressId: ids }, transaction });
      const progress = await LessonProgress.destroy({ where: { id: ids }, transaction });
      return { counts: { progress, answers, reinforcements, quizAttempts } };
    });

    if (deleted.error) return res.status(deleted.status).json({ error: deleted.error });
    res.json({ message: 'Course progress reset successfully', deleted: deleted.counts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lesson progress of an enrollment, one entry per story of the course (unit/story order).
// Visible to the student who owns the enrollment and to the teacher of the course.
router.get('/:enrollmentId/progress', authMiddleware, async (req, res) => {
  try {
    if (!validId(req.params.enrollmentId)) return res.status(400).json({ error: 'Invalid enrollmentId' });

    const enrollment = await Enrollment.findByPk(req.params.enrollmentId, { include: [{ model: Course, as: 'course' }] });
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

    const isOwner = req.user.role === 'student' && enrollment.studentId === req.user.id;
    const isCourseTeacher = req.user.role === 'teacher' && enrollment.course.teacherId === req.user.id;
    if (!isOwner && !isCourseTeacher) return res.status(403).json({ error: 'Not authorized' });

    const units = await Unit.findAll({
      where: { courseId: enrollment.courseId },
      include: [{ model: Story, as: 'stories', attributes: ['id', 'title', 'order'] }],
      order: [['order', 'ASC'], ['id', 'ASC'], [{ model: Story, as: 'stories' }, 'order', 'ASC'], [{ model: Story, as: 'stories' }, 'id', 'ASC']]
    });

    const progressRows = await LessonProgress.findAll({ where: { enrollmentId: enrollment.id } });
    const progressByStory = new Map(progressRows.map(row => [row.storyId, row]));
    const progressIds = progressRows.map(row => row.id);
    const planIds = [...new Set(progressRows.map(row => row.planId))];

    const plans = planIds.length ? await LessonPlan.findAll({ where: { id: planIds }, attributes: ['id', 'revision'] }) : [];
    const revisionByPlan = new Map(plans.map(plan => [plan.id, plan.revision]));
    const reinforcementBlocks = planIds.length
      ? await LessonBlock.findAll({ where: { planId: planIds, active: true, type: REINFORCEMENTS }, attributes: ['planId', 'blockKey'] })
      : [];
    const blockKeysByPlan = new Map();
    for (const block of reinforcementBlocks) {
      if (!blockKeysByPlan.has(block.planId)) blockKeysByPlan.set(block.planId, new Set());
      blockKeysByPlan.get(block.planId).add(block.blockKey);
    }

    const answerRows = progressIds.length ? await LessonAnswer.findAll({ where: { lessonProgressId: progressIds } }) : [];
    const reinforcementRows = progressIds.length
      ? await LessonReinforcement.findAll({ where: { lessonProgressId: progressIds, completed: true } })
      : [];
    const answersByProgress = new Map();
    for (const row of answerRows) {
      if (!answersByProgress.has(row.lessonProgressId)) answersByProgress.set(row.lessonProgressId, []);
      answersByProgress.get(row.lessonProgressId).push(row);
    }
    const reinforcementsByProgress = new Map();
    for (const row of reinforcementRows) {
      if (!reinforcementsByProgress.has(row.lessonProgressId)) reinforcementsByProgress.set(row.lessonProgressId, []);
      reinforcementsByProgress.get(row.lessonProgressId).push(row);
    }

    // Only stories with a published lesson count: a draft cannot be opened by the student.
    const allStoryIds = units.flatMap(unit => unit.stories.map(story => story.id));
    const publishedStoryIds = new Set(allStoryIds.length
      ? (await LessonPlan.findAll({ where: { storyId: allStoryIds, status: 'published' }, attributes: ['storyId'], raw: true }))
        .map(plan => plan.storyId)
      : []);

    const result = [];
    for (const unit of units) {
      for (const story of unit.stories) {
        const progress = progressByStory.get(story.id);
        if (!publishedStoryIds.has(story.id) && !progress) continue;
        const entry = {
          storyId: story.id, storyTitle: story.title, unitId: unit.id, unitTitle: unit.title,
          revision: null, lastBlockKey: null, narrativeCompleted: false, completedAt: null,
          answers: { total: 0, correct: 0, attempts: 0 }, reinforcements: { total: 0, completed: 0 }
        };
        if (progress) {
          const answers = answersByProgress.get(progress.id) || [];
          const blockKeys = blockKeysByPlan.get(progress.planId) || new Set();
          const completed = (reinforcementsByProgress.get(progress.id) || []).filter(row => blockKeys.has(row.blockKey));
          entry.revision = revisionByPlan.get(progress.planId) ?? null;
          entry.lastBlockKey = progress.lastBlockKey ?? null;
          entry.narrativeCompleted = progress.narrativeCompleted;
          // lesson_progress has no completion timestamp: the last update of a completed lesson stands in for it.
          entry.completedAt = progress.narrativeCompleted ? progress.updatedAt : null;
          // total/correct count distinct question blocks answered / answered correctly at least once; attempts counts every submission.
          entry.answers = {
            total: new Set(answers.map(a => a.blockKey)).size,
            correct: new Set(answers.filter(a => a.isCorrect).map(a => a.blockKey)).size,
            attempts: answers.length
          };
          entry.reinforcements = { total: blockKeys.size, completed: new Set(completed.map(r => r.blockKey)).size };
        }
        result.push(entry);
      }
    }

    const completion = await certificates.completionOf(enrollment);
    res.json({
      stories: result,
      quizzes: completion.quizzes,
      certificate: await certificates.statusOf(enrollment, completion),
      next: await nextCourseOffer(enrollment)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Issues the certificate of completion (idempotent: an enrolment that already has one gets the same one back).
// Only the student who owns the enrolment. `name` is the name to print (up to 100 characters, the account name by default).
router.post('/:enrollmentId/certificate', authMiddleware, isStudent, async (req, res) => {
  try {
    if (!validId(req.params.enrollmentId)) return res.status(400).json({ error: 'Invalid enrollmentId' });
    const enrollment = await Enrollment.findByPk(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });
    if (enrollment.studentId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const name = req.body ? req.body.name : undefined;
    const cleaned = certificates.cleanName(name, req.user.name);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });

    const result = await certificates.issue(enrollment, { name });
    if (result.missing) return res.status(409).json({ error: 'The course is not completed yet', missing: result.missing });
    res.status(result.created ? 201 : 200).json(certificates.publicShape(result.certificate));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
