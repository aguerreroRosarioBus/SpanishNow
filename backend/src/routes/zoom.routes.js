const router = require('express').Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const c = require('../services/zoomConnection');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const secure = [authMiddleware, (req, res, next) => req.impersonatedBy
  ? next(new (require('../services/zoomAdapter').ZoomError)('forbidden', 403)) : next()];
router.get('/integrations/zoom', ...secure, wrap(async (req, res) => res.json(await c.status(req.user))));
router.post('/integrations/zoom/connect', ...secure, requireFeature('zoom'), wrap(async (req, res) => res.json(await c.connect(req.user))));
router.get('/integrations/zoom/start', requireFeature('zoom'), wrap(async (req, res) => res.redirect(await c.start(req.query.state, res))));
router.get('/integrations/zoom/callback', requireFeature('zoom'), wrap(async (req, res) => {
  await c.callback(req);
  res.clearCookie(c.cookieName, { path: '/api/integrations/zoom/callback' });
  res.redirect(`${new URL(process.env.FRONTEND_URL || 'http://localhost:4200').origin}/teacher/integrations/zoom`);
}));
router.delete('/integrations/zoom', ...secure, wrap(async (req, res) => res.json(await c.disconnect(req.user))));
const zoom = require('../services/zoomService');
router.get('/integrations/zoom/sessions', ...secure, wrap(async (req, res) => res.json(await zoom.sessions(req.user))));
router.post('/integrations/zoom/sessions/:id/retry', ...secure, wrap(async (req, res) => res.json(await zoom.retry(req.user, req.params.id))));
router.put('/integrations/zoom/sessions/:id/manual-link', ...secure, wrap(async (req, res) => res.json(await zoom.manual(req.user, req.params.id, req.body))));
router.get('/class-sessions/:id/join', ...secure, wrap(async (req, res) => {
  const result = await zoom.join(req.user, req.params.id); res.set('Cache-Control', 'no-store'); res.json(result);
}));
router.use(require('./zoomPreflight'));
module.exports = router;
