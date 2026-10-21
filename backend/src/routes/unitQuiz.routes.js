// Unit quizzes. Teacher: GET/PUT/DELETE /units/:id/quiz (with the correct answers).
// Student: GET /units/:id/quiz/student (without them) and POST /units/:id/quiz/attempts.
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher, isStudent } = require('../middlewares/auth.middleware');
const { Unit, Course, Enrollment, UnitQuiz, UnitQuizQuestion, UnitQuizAttempt } = require('../models');
const { canReadCourse } = require('../utils/courseAccess');
const quizzes = require('../services/quizService');

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

// Loads the unit and its course. Answers 404 itself and returns null when the unit does not exist.
async function loadUnit(req, res) {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Unit not found' }); return null; }
  const unit = await Unit.findByPk(req.params.id, { include: [{ model: Course, as: 'course' }] });
  if (!unit) { res.status(404).json({ error: 'Unit not found' }); return null; }
  return unit;
}

async function ownUnit(req, res) {
  const unit = await loadUnit(req, res);
  if (!unit) return null;
  if (unit.course.teacherId !== req.user.id) { res.status(403).json({ error: 'Not authorized' }); return null; }
  return unit;
}

router.get('/:id/quiz', authMiddleware, isTeacher, async (req, res) => {
  try {
    const unit = await ownUnit(req, res);
    if (!unit) return;
    const quiz = await UnitQuiz.findOne({ where: { unitId: unit.id } });
    if (!quiz) return res.status(404).json({ error: 'This unit has no quiz' });
    res.json(await quizzes.teacherView(quiz));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/quiz', authMiddleware, isTeacher, async (req, res) => {
  try {
    const unit = await ownUnit(req, res);
    if (!unit) return;
    const parsed = quizzes.parseQuizPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const quizId = await quizzes.saveQuiz(unit.id, parsed.value);
    res.json(await quizzes.teacherView(await UnitQuiz.findByPk(quizId)));
  } catch (error) {
    if (error instanceof quizzes.QuizError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/quiz', authMiddleware, isTeacher, async (req, res) => {
  try {
    const unit = await ownUnit(req, res);
    if (!unit) return;
    const quiz = await UnitQuiz.findOne({ where: { unitId: unit.id } });
    if (!quiz) return res.status(404).json({ error: 'This unit has no quiz' });
    await UnitQuizAttempt.destroy({ where: { quizId: quiz.id } });
    await UnitQuizQuestion.destroy({ where: { quizId: quiz.id } });
    await quiz.destroy();
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The student's quiz: published only, never with the correct answers.
router.get('/:id/quiz/student', authMiddleware, async (req, res) => {
  try {
    const unit = await loadUnit(req, res);
    if (!unit) return;
    if (!(await canReadCourse(req.user, unit.course))) return res.status(403).json({ error: 'Not authorized' });
    const quiz = await UnitQuiz.findOne({ where: { unitId: unit.id, isPublished: true } });
    if (!quiz) return res.status(404).json({ error: 'This unit has no quiz' });
    const enrollment = req.user.role === 'student'
      ? await Enrollment.findOne({ where: { studentId: req.user.id, courseId: unit.courseId }, attributes: ['id'] })
      : null;
    res.json(await quizzes.studentView(quiz, enrollment ? enrollment.id : null));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/quiz/attempts', authMiddleware, isStudent, async (req, res) => {
  try {
    const unit = await loadUnit(req, res);
    if (!unit) return;
    const enrollment = await Enrollment.findOne({ where: { studentId: req.user.id, courseId: unit.courseId } });
    if (!enrollment) return res.status(403).json({ error: 'Not authorized' });
    const quiz = await UnitQuiz.findOne({ where: { unitId: unit.id, isPublished: true } });
    if (!quiz) return res.status(404).json({ error: 'This unit has no quiz' });

    const questions = await UnitQuizQuestion.findAll({ where: { quizId: quiz.id }, order: [['order', 'ASC'], ['id', 'ASC']] });
    const parsed = quizzes.parseAnswers(req.body, questions);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { results, score } = quizzes.grade(questions, parsed.answers);
    const passed = score >= quiz.passingScore;
    await UnitQuizAttempt.create({ quizId: quiz.id, enrollmentId: enrollment.id, answers: parsed.answers, score, passed });
    const bestScore = (await quizzes.bestScores(enrollment.id, [quiz.id])).get(quiz.id);
    res.status(201).json({ score, passed, bestScore, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
