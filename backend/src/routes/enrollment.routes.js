const express = require('express');
const router = express.Router();
const { authMiddleware, isStudent } = require('../middlewares/auth.middleware');
const { Enrollment, Course, Progress, Story, Unit, ActivityConfig } = require('../models');

// Get student enrollments with full course details and progress
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
              include: [
                {
                  model: Story,
                  as: 'stories'
                },
                {
                  model: ActivityConfig,
                  as: 'activityConfigs'
                }
              ]
            }
          ]
        },
        {
          model: Progress,
          as: 'progress'
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

// Reset course progress (delete all progress for an enrollment)
// IMPORTANT: This route must come BEFORE /:enrollmentId/progress to avoid route conflicts
router.delete('/:enrollmentId/reset-progress', authMiddleware, isStudent, async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete all progress records for this enrollment
    await Progress.destroy({
      where: { enrollmentId }
    });

    res.json({ message: 'Course progress reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get progress for an enrollment
router.get('/:enrollmentId/progress', authMiddleware, async (req, res) => {
  try {
    const enrollment = await Enrollment.findByPk(req.params.enrollmentId, {
      include: [
        {
          model: Progress,
          as: 'progress',
          include: [{ model: Story, as: 'story' }]
        }
      ]
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.studentId !== req.user.id && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(enrollment.progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark story as completed
router.post('/progress', authMiddleware, isStudent, async (req, res) => {
  try {
    const { enrollmentId, storyId } = req.body;

    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const existingProgress = await Progress.findOne({
      where: { enrollmentId, storyId }
    });

    if (existingProgress) {
      await existingProgress.update({ completed: true });
      return res.json(existingProgress);
    }

    const progress = await Progress.create({
      enrollmentId,
      storyId,
      completed: true
    });

    res.status(201).json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark flashcards as viewed for a progress record
router.post('/progress/:progressId/flashcards-viewed', authMiddleware, isStudent, async (req, res) => {
  try {
    const { progressId } = req.params;

    const progress = await Progress.findByPk(progressId, {
      include: [{ model: Enrollment, as: 'enrollment' }]
    });

    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    if (progress.enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await progress.update({ flashcardsViewed: true });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark listen & repeat as completed for a progress record
router.post('/progress/:progressId/listen-repeat-completed', authMiddleware, isStudent, async (req, res) => {
  try {
    const { progressId } = req.params;

    const progress = await Progress.findByPk(progressId, {
      include: [{ model: Enrollment, as: 'enrollment' }]
    });

    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    if (progress.enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await progress.update({ listenRepeatCompleted: true });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark matching as completed for a progress record
router.post('/progress/:progressId/matching-completed', authMiddleware, isStudent, async (req, res) => {
  try {
    const { progressId } = req.params;

    const progress = await Progress.findByPk(progressId, {
      include: [{ model: Enrollment, as: 'enrollment' }]
    });

    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    if (progress.enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await progress.update({ matchingCompleted: true });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update activitiesCompleted flag (checks if all granular activities are done)
router.post('/progress/:progressId/update-activities', authMiddleware, isStudent, async (req, res) => {
  try {
    const { progressId } = req.params;

    const progress = await Progress.findByPk(progressId, {
      include: [{ model: Enrollment, as: 'enrollment' }]
    });

    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    if (progress.enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check if all activities are completed
    const allActivitiesCompleted =
      progress.flashcardsViewed &&
      progress.questionsCompleted &&
      progress.matchingCompleted &&
      progress.listenRepeatCompleted;

    await progress.update({ activitiesCompleted: allActivitiesCompleted });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Complete a unit-level activity
router.post('/:enrollmentId/complete-activity', authMiddleware, isStudent, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { activityType } = req.body;

    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updateField = {
      'questions': 'questionsCompleted',
      'flashcards': 'flashcardsCompleted',
      'matching': 'matchingCompleted',
      'listen_repeat': 'listenRepeatCompleted'
    };

    if (!updateField[activityType]) {
      return res.status(400).json({ error: 'Invalid activity type' });
    }

    await enrollment.update({
      [updateField[activityType]]: true
    });

    res.json(enrollment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset a unit-level activity (for repeating)
router.post('/:enrollmentId/reset-activity', authMiddleware, isStudent, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { activityType } = req.body;

    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updateField = {
      'questions': 'questionsCompleted',
      'flashcards': 'flashcardsCompleted',
      'matching': 'matchingCompleted',
      'listen_repeat': 'listenRepeatCompleted'
    };

    if (!updateField[activityType]) {
      return res.status(400).json({ error: 'Invalid activity type' });
    }

    await enrollment.update({
      [updateField[activityType]]: false
    });

    res.json(enrollment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
