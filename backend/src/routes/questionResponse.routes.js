const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { QuestionResponse, Question, Progress, Enrollment, Story, Unit } = require('../models');
const { Op } = require('sequelize');

// Helper function to normalize text for comparison (case-insensitive, accent-insensitive)
function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics/accents
}

// Submit responses for a story (students only)
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { progressId, responses } = req.body;

    // Validate request body
    if (!progressId || !responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: progressId and responses array'
      });
    }

    // Verify ownership: progress → enrollment → studentId
    const progress = await Progress.findByPk(progressId, {
      include: [{
        model: Enrollment,
        as: 'enrollment',
        attributes: ['id', 'studentId', 'courseId']
      }]
    });

    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    if (progress.enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to submit responses for this progress' });
    }

    // Get all questions for validation
    const questionIds = responses.map(r => r && r.questionId);
    if (new Set(questionIds.map(Number)).size !== questionIds.length || responses.some(r => !r || !Number.isInteger(Number(r.questionId)) || typeof r.studentAnswer !== 'string' || !r.studentAnswer.trim() || r.studentAnswer.length > 200)) {
      return res.status(400).json({ error: 'Invalid or duplicate question response' });
    }
    const story = await Story.findByPk(progress.storyId, { include: [{ model: Unit, as: 'unit' }] });
    if (!story || story.unit.courseId !== progress.enrollment.courseId) {
      return res.status(403).json({ error: 'Progress does not belong to the enrolled course' });
    }
    const questions = await Question.findAll({
      where: { id: { [Op.in]: questionIds }, storyId: progress.storyId }
    });

    if (questions.length !== questionIds.length) {
      return res.status(400).json({ error: 'One or more invalid question IDs' });
    }

    // Create a map for quick question lookup
    const questionMap = new Map(questions.map(q => [q.id, q]));

    // Validate and save each response
    const results = [];
    let allCorrect = true;

    for (const response of responses) {
      const { questionId, studentAnswer } = response;

      if (!questionId || !studentAnswer) {
        return res.status(400).json({
          error: 'Each response must include questionId and studentAnswer'
        });
      }

      const question = questionMap.get(Number(questionId));
      if (!question) {
        return res.status(400).json({ error: `Question ${questionId} not found` });
      }

      // For open_ended questions, always mark as correct (they're for self-correction)
      // For other types, compare answers (case-insensitive and accent-insensitive)
      const isCorrect = question.answerType === 'open_ended'
        ? true
        : normalizeText(studentAnswer) === normalizeText(question.correctAnswer);

      if (!isCorrect) {
        allCorrect = false;
      }

      // Upsert (create or update) the response
      await QuestionResponse.upsert({
        progressId,
        questionId,
        studentAnswer: studentAnswer.trim(),
        isCorrect
      });

      // Add to results (only include correctAnswer if wrong)
      results.push({
        questionId,
        isCorrect,
        ...(isCorrect ? {} : { correctAnswer: question.correctAnswer })
      });
    }

    // Update progress if all answers are correct
    if (allCorrect) {
      await progress.update({ questionsCompleted: true });
    }

    res.json({
      results,
      allCorrect,
      questionsCompleted: allCorrect
    });
  } catch (error) {
    console.error('Error submitting responses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get responses for a progress record (students only)
router.get('/progress/:progressId', authMiddleware, async (req, res) => {
  try {
    // Verify ownership
    const progress = await Progress.findByPk(req.params.progressId, {
      include: [{
        model: Enrollment,
        as: 'enrollment',
        attributes: ['id', 'studentId']
      }]
    });

    if (!progress) {
      return res.status(404).json({ error: 'Progress record not found' });
    }

    if (progress.enrollment.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view these responses' });
    }

    // Get all responses for this progress
    const responses = await QuestionResponse.findAll({
      where: { progressId: req.params.progressId },
      include: [{
        model: Question,
        as: 'question',
        attributes: ['id', 'questionText', 'answerType', 'options']
      }],
      order: [['createdAt', 'ASC']]
    });

    res.json(responses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
