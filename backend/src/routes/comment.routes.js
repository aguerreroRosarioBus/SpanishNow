// A single comment: edit and delete (author; delete also the teacher of the course), hide (teacher).
const express = require('express');
const router = express.Router();
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const comments = require('../services/commentService');
const { ContentLockedError, sendLocked } = require('../services/unitAvailability');

function handleError(res, error) {
  if (error instanceof ContentLockedError) return sendLocked(res, error);
  if (error instanceof comments.CommentError) return res.status(error.status).json(comments.failure(error));
  return res.status(500).json({ error: error.message });
}

/** Loads the comment. Answers 404 itself and returns null when it does not exist. */
async function load(req, res) {
  const comment = await comments.loadComment(req.params.id);
  if (!comment) res.status(404).json({ error: 'Comment not found' });
  return comment;
}

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await load(req, res);
    if (!comment) return;
    if (comment.userId !== req.user.id) return res.status(403).json({ error: 'Only the author can edit a comment' });
    // The author must still have access to the lesson (and it must be open: drip content).
    await comments.accessFor(req.user, comment.story);
    const sanitized = comments.sanitizeBody((req.body || {}).body);
    if (sanitized.error) return res.status(400).json({ error: sanitized.error });
    if (sanitized.value !== comment.body) await comment.update({ body: sanitized.value, editedAt: new Date() });
    res.json(comments.present(comment, req.user, comment.story.unit.course));
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const comment = await load(req, res);
    if (!comment) return;
    const isCourseTeacher = req.user.role === 'teacher' && comment.story.unit.course.teacherId === req.user.id;
    if (comment.userId !== req.user.id && !isCourseTeacher) return res.status(403).json({ error: 'Not authorized' });
    await comments.remove(comment);
    res.status(204).end();
  } catch (error) {
    handleError(res, error);
  }
});

router.put('/:id/hidden', authMiddleware, isTeacher, async (req, res) => {
  try {
    const comment = await load(req, res);
    if (!comment) return;
    if (comment.story.unit.course.teacherId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    const hidden = (req.body || {}).hidden;
    if (typeof hidden !== 'boolean') return res.status(400).json({ error: 'hidden must be true or false' });
    await comment.update({ hidden });
    res.json(comments.present(comment, req.user, comment.story.unit.course));
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
