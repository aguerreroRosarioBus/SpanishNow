// Teacher's inbox of lesson comments (first level), of their own courses.
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const comments = require('../services/commentService');

router.use('/comments', authMiddleware, isTeacher);

const STATUSES = ['unanswered', 'all'];

// ?status=unanswered|all (default all) &courseId &page. "Unanswered": a student's first-level comment, not hidden, without a reply of the teacher.
router.get('/comments', async (req, res) => {
  try {
    const status = req.query.status === undefined || req.query.status === '' ? 'all' : String(req.query.status);
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
    let courseId = null;
    if (req.query.courseId !== undefined && String(req.query.courseId) !== '') {
      if (!comments.validId(req.query.courseId)) return res.status(400).json({ error: 'courseId is not valid' });
      courseId = Number(req.query.courseId);
    }
    const page = req.query.page !== undefined && /^\d{1,9}$/.test(String(req.query.page)) && Number(req.query.page) >= 1 ? Number(req.query.page) : 1;
    res.json(await comments.inbox(req.user.id, { status, courseId, page }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
