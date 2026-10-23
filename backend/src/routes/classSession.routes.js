const express = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const sessions = require('../services/classSessionService');
const router = express.Router();
router.use(authMiddleware, (req, res, next) => req.impersonatedBy
  ? res.status(403).json({ error: 'La agenda privada no está disponible al ingresar como otra persona.', code: 'forbidden', params: { reason: 'impersonation' } }) : next());
const handle = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
router.get('/', handle(async (req, res) => res.json(await sessions.list(req.user, req.query))));
router.get('/options', handle(async (req, res) => res.json(await sessions.options(req.user, req.query))));
router.get('/reminders', handle(async (req, res) => res.json(await sessions.remindersFeed(req.user))));
router.post('/', requireFeature('class_scheduling'), handle(async (req, res) => {
  const result = await sessions.create(req.user, req.body, req.get('Idempotency-Key'));
  res.status(result.created ? 201 : 200).json(result.session);
}));
router.get('/:id', handle(async (req, res) => res.json(await sessions.detail(req.user, req.params.id))));
router.get('/:id/calendar.ics', handle(async (req, res) => { // W07: ICS para quien no conecta Google
  const ics = await sessions.ics(req.user, req.params.id);
  res.set('Content-Disposition', `attachment; filename="clase-${ics.id}.ics"`).type('text/calendar; charset=utf-8').send(ics.body);
}));
router.get('/:id/join', requireFeature('zoom'), handle(async (req, res) => { // W08: una sola ruta, conservando auth/impersonación de W06
  res.set('Cache-Control', 'no-store').json(await sessions.join(req.user, req.params.id));
}));
router.post('/:id/sync/retry', handle(async (req, res) => res.json(await sessions.retrySync(req.user, req.params.id))));
router.post('/:id/proposals', requireFeature('class_scheduling'), handle(async (req, res) => res.json(await sessions.reschedule(req.user, req.params.id, req.body))));
for (const action of ['accept', 'decline']) router.post(`/:id/proposals/:version/${action}`, requireFeature('class_scheduling'), handle(async (req, res) => {
  res.json(await sessions[action](req.user, req.params.id, Number(req.params.version), req.body));
}));
for (const action of ['cancel', 'attendance', 'adjustment', 'requestExtension']) router.post(`/:id/${action}`, handle(async (req, res) => res.json(await sessions[action](req.user, req.params.id, req.body))));
module.exports = router;
