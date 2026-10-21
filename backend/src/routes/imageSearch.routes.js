const express = require('express');
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const images = require('../services/imageSearchService');
const router = express.Router();

// Bound paid searches and downloads per teacher. Entries expire without a background timer.
const requests = new Map();
router.use(authMiddleware, isTeacher, (req, res, next) => {
  const now = Date.now();
  for (const [id, entry] of requests) if (entry.until <= now) requests.delete(id);
  const entry = requests.get(req.user.id) || { count: 0, until: now + 60000 };
  if (++entry.count > 60) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
    return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto y vuelve a intentar.' });
  }
  requests.set(req.user.id, entry);
  res.set('Cache-Control', 'no-store');
  next();
});
const sendError = (res, e) => res.status(e.status || 502).json({ error: e.status ? e.message : 'El buscador no está disponible. Inténtalo de nuevo.' });
router.get('/search', async (req, res) => {
  try { res.json(await images.searchImages(req.query.q, req.query.page === undefined ? 1 : Number(req.query.page), req.user.id)); }
  catch (e) { sendError(res, e); }
});
router.post('/import', async (req, res) => {
  try {
    const { buffer, type } = await images.importImage(req.body.token, req.user.id);
    res.set('Content-Type', type).set('X-Content-Type-Options', 'nosniff').send(buffer);
  } catch (e) { sendError(res, e); }
});
module.exports = router;
