const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const { Question, Story, Unit, Course } = require('../models');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload.middleware');

// Get questions by story ID (public - for students to view)
router.get('/story/:storyId', async (req, res) => {
  try {
    const questions = await Question.findAll({
      where: { storyId: req.params.storyId },
      order: [['createdAt', 'ASC']]
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create question (teachers only, own courses)
router.post('/', authMiddleware, isTeacher, upload.single('audio'), async (req, res) => {
  try {
    const { storyId, questionText, answerType, options, correctAnswer } = req.body;

    // Validate required fields
    if (!storyId || !questionText || !answerType || !correctAnswer) {
      return res.status(400).json({
        error: 'Missing required fields: storyId, questionText, answerType, correctAnswer'
      });
    }

    // Validate answerType
    if (!['yes_no', 'choice'].includes(answerType)) {
      return res.status(400).json({
        error: 'answerType must be either "yes_no" or "choice"'
      });
    }

    // Validate that options exist for choice questions
    if (answerType === 'choice' && (!options || !Array.isArray(options) || options.length < 2)) {
      return res.status(400).json({
        error: 'choice questions must have at least 2 options'
      });
    }

    // Verify ownership: story → unit → course → teacherId
    const story = await Story.findByPk(storyId, {
      include: [{
        model: Unit,
        as: 'unit',
        include: [{
          model: Course,
          as: 'course',
          attributes: ['id', 'teacherId']
        }]
      }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to add questions to this story' });
    }

    let audioUrl = null;

    // Upload audio if provided
    if (req.file && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploadFromBuffer(req.file.buffer, {
          folder: 'spanishnow/questions/audio',
          resource_type: 'video' // Cloudinary uses 'video' for audio files
        });
        audioUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary audio upload failed for question:', cloudinaryError.message);
      }
    }

    // Create question
    const question = await Question.create({
      storyId,
      questionText,
      answerType,
      options: answerType === 'choice' ? options : null,
      correctAnswer,
      audioUrl
    });

    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update question (teachers only, own courses)
router.put('/:id', authMiddleware, isTeacher, upload.single('audio'), async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, {
      include: [{
        model: Story,
        as: 'story',
        include: [{
          model: Unit,
          as: 'unit',
          include: [{
            model: Course,
            as: 'course',
            attributes: ['id', 'teacherId']
          }]
        }]
      }]
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Verify ownership
    if (question.story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this question' });
    }

    const { questionText, answerType, options, correctAnswer } = req.body;

    // Validate answerType if provided
    if (answerType && !['yes_no', 'choice'].includes(answerType)) {
      return res.status(400).json({
        error: 'answerType must be either "yes_no" or "choice"'
      });
    }

    // Validate options for choice questions
    const finalAnswerType = answerType || question.answerType;
    if (finalAnswerType === 'choice') {
      const finalOptions = options || question.options;
      if (!finalOptions || !Array.isArray(finalOptions) || finalOptions.length < 2) {
        return res.status(400).json({
          error: 'choice questions must have at least 2 options'
        });
      }
    }

    let audioUrl = question.audioUrl;

    // Upload new audio if provided
    if (req.file && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'spanishnow/questions/audio',
          resource_type: 'video'
        });
        audioUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary audio upload failed for question:', cloudinaryError.message);
      }
    }

    // Update question
    await question.update({
      questionText: questionText || question.questionText,
      answerType: answerType || question.answerType,
      options: answerType === 'choice' ? (options || question.options) : null,
      correctAnswer: correctAnswer || question.correctAnswer,
      audioUrl
    });

    res.json(question);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete question (teachers only, own courses)
router.delete('/:id', authMiddleware, isTeacher, async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, {
      include: [{
        model: Story,
        as: 'story',
        include: [{
          model: Unit,
          as: 'unit',
          include: [{
            model: Course,
            as: 'course',
            attributes: ['id', 'teacherId']
          }]
        }]
      }]
    });

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Verify ownership
    if (question.story.unit.course.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this question' });
    }

    await question.destroy();

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
