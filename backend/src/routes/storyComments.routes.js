// Comments of a lesson: GET/POST /stories/:id/comments. Mounted under /api/stories before the story routes.
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const comments = require('../services/commentService');
const { ContentLockedError, sendLocked } = require('../services/unitAvailability');

function handleError(res, error) {
  if (error instanceof ContentLockedError) return sendLocked(res, error);
  if (error instanceof comments.CommentError) return res.status(error.status).json(comments.failure(error));
  return res.status(500).json({ error: error.message });
}

const pageFrom = value => (value !== undefined && /^\d{1,9}$/.test(String(value)) && Number(value) >= 1 ? Number(value) : 1);

router.get('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const story = await comments.loadStory(req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const access = await comments.accessFor(req.user, story);
    res.json(await comments.list(req.user, story, access, pageFrom(req.query.page)));
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const story = await comments.loadStory(req.params.id);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const access = await comments.accessFor(req.user, story);
    const { comment, parent } = await comments.create(req.user, story, access, req.body || {});
    comment.author = req.user;
    res.status(201).json({ ...comments.present(comment, req.user, story.unit.course), replies: [] });
    // After the response: sending mail never delays or fails the request.
    comments.notify(comment, parent, req.user, story);
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
