// /api/integrations/google-calendar* (CONTRATO §9.8, W07). Estado, conexión OAuth, calendarios, desconexión y
// notificaciones push. Las credenciales nunca salen en una respuesta. Con el flag apagado todo responde 404.
const express = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const calendar = require('../services/googleCalendarService');
const sync = require('../services/googleCalendarSync');
const router = express.Router();
const handle = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const noImpersonation = (req, res, next) => (req.impersonatedBy
  ? res.status(403).json({ error: 'Las integraciones no están disponibles al ingresar como otra persona.', code: 'forbidden', params: { reason: 'impersonation' } }) : next());
router.use(requireFeature('google_calendar'));

// Callbacks de Google: sin sesión (navegación del navegador / servidores de Google); la verificación es el state o el token del canal.
router.get('/callback', handle(async (req, res) => res.redirect(await calendar.callback(req.query))));
router.post('/notifications', handle(async (req, res) => { res.status(await sync.notification(req.headers)).end(); }));

router.use(authMiddleware, noImpersonation);
router.get('/', handle(async (req, res) => res.json(await calendar.status(req.user))));
router.post('/complete', handle(async (req, res) => res.json(await calendar.complete(req.user, req.body?.token))));
router.post('/connect', handle(async (req, res) => res.json(await calendar.connect(req.user))));
router.patch('/', handle(async (req, res) => res.json(await calendar.update(req.user, req.body))));
router.delete('/', handle(async (req, res) => res.json(await calendar.disconnect(req.user))));
module.exports = router;
