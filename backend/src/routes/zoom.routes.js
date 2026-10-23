const router = require('express').Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const c = require('../services/zoomConnection');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const secure = [authMiddleware, (req, res, next) => req.impersonatedBy
  ? next(new (require('../services/zoomAdapter').ZoomError)('forbidden', 403)) : next()];
router.get('/integrations/zoom', ...secure, wrap(async (req, res) => res.json(await c.status(req.user))));
router.post('/integrations/zoom/connect', ...secure, requireFeature('zoom'), wrap(async (req, res) => res.json(await c.connect(req.user))));
router.get('/integrations/zoom/callback', requireFeature('zoom'), wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const target = `${c.config().frontend}/teacher/integrations/zoom`;
  try {
    const token = await c.callback(req);
    res.redirect(`${target}?zoom=confirm&token=${encodeURIComponent(token)}`);
  } catch (error) {
    if (error.code === 'zoom_oauth_denied') {
      res.redirect(`${target}?zoom=zoom_oauth_denied`);
      return;
    }
    // Un callback inválido es un resultado de OAuth, no una respuesta JSON de API.
    // El código público es estable y no filtra detalles del proveedor.
    if (error.statusCode === 400 || error.code === 'zoom_oauth_invalid') {
      res.redirect(`${target}?zoom=zoom_oauth_invalid`);
      return;
    }
    if (error.code === 'provider_unavailable' || error.code?.startsWith('zoom_')) {
      res.redirect(`${target}?zoom=zoom_provider_unavailable`);
      return;
    }
    if (error.code === 'forbidden') {
      res.redirect(`${target}?zoom=forbidden`);
      return;
    }
    throw error;
  }
}));
router.post('/integrations/zoom/complete', ...secure, requireFeature('zoom'), wrap(async (req, res) => res.json(await c.complete(req.user, req.body?.token))));
router.delete('/integrations/zoom', ...secure, wrap(async (req, res) => res.json(await c.disconnect(req.user))));
const zoom = require('../services/zoomService');
router.get('/integrations/zoom/sessions', ...secure, wrap(async (req, res) => res.json(await zoom.sessions(req.user))));
router.get('/integrations/zoom/sessions/:id', ...secure, wrap(async (req, res) => res.json(await zoom.sessionStatus(req.user, req.params.id))));
router.post('/integrations/zoom/sessions/:id/retry', ...secure, wrap(async (req, res) => res.json(await zoom.retry(req.user, req.params.id))));
router.put('/integrations/zoom/sessions/:id/manual-link', ...secure, wrap(async (req, res) => res.json(await zoom.manual(req.user, req.params.id, req.body))));
router.use(require('./zoomPreflight'));
module.exports = router;
