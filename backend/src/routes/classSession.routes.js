const express = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const sessions = require('../services/classSessionService');
const router = express.Router();
router.use(authMiddleware, (req, res, next) => req.impersonatedBy
  ? res.status(403).json({ error: 'La agenda privada no está disponible al ingresar como otra persona.', code: 'forbidden', params: { reason: 'impersonation' } }) : next());
const handle = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
router.get('/', handle(async (req, res) => res.json(await sessions.list(req.user, req.query))));
router.post('/', requireFeature('class_scheduling'), handle(async (req, res) => {
  const result = await sessions.create(req.user, req.body, req.get('Idempotency-Key'));
  res.status(result.created ? 201 : 200).json(result.session);
}));
router.get('/:id', handle(async (req, res) => res.json(await sessions.detail(req.user, req.params.id))));
module.exports = router;
