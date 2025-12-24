const express = require('express');
const router = express.Router();
const { authMiddleware, isStudent } = require('../middlewares/auth.middleware');
const { Enrollment, Course, Progress, Story, Unit } = require('../models');

// Get student enrollments
router.get('/my-courses', authMiddleware, isStudent, async (req, res) => {
  try {
    const enrollments = await Enrollment.findAll({
      where: { studentId: req.user.id },
      include: [{ model: Course, as: 'course' }]
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

module.exports = router;
