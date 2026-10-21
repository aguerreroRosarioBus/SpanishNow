const express = require('express');
const router = express.Router();
const { authMiddleware, isStudent } = require('../middlewares/auth.middleware');
const sequelize = require('../config/database');
const { Enrollment, Course, Story, Unit, LessonPlan, LessonBlock, LessonProgress, LessonAnswer, LessonReinforcement } = require('../models');

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

    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enroll in a course
router.post('/', authMiddleware, isStudent, async (req, res) => {
  try {
    const { courseId } = req.body;

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const existingEnrollment = await Enrollment.findOne({
      where: { studentId: req.user.id, courseId }
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    const enrollment = await Enrollment.create({
      studentId: req.user.id,
      courseId
    });

    res.status(201).json(enrollment);
  } catch (error) {
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

      const rows = await LessonProgress.findAll({ where: { enrollmentId: enrollment.id }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
      const ids = rows.map(row => row.id);
      if (!ids.length) return { counts: { progress: 0, answers: 0, reinforcements: 0 } };

      const answers = await LessonAnswer.destroy({ where: { lessonProgressId: ids }, transaction });
      const reinforcements = await LessonReinforcement.destroy({ where: { lessonProgressId: ids }, transaction });
      const progress = await LessonProgress.destroy({ where: { id: ids }, transaction });
      return { counts: { progress, answers, reinforcements } };
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

    const result = [];
    for (const unit of units) {
      for (const story of unit.stories) {
        const progress = progressByStory.get(story.id);
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

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
