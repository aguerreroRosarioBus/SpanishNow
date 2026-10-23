// Se monta aditivamente antes de las rutas W05/W06. No modifica sus servicios ni sus locks de agenda/saldo.
const router = require('express').Router();
const M = require('../models');
const { authMiddleware } = require('../middlewares/auth.middleware');
const features = require('../config/features');
const zoom = require('../services/zoomService');
const { fail } = require('../services/zoomAdapter');
const check = fn => async (req, res, next) => {
  try {
    if (!features.isEnabled('zoom')) return next();
    if (req.impersonatedBy) fail('forbidden', 403);
    await fn(req); next();
  } catch (error) { next(error); }
};
router.post('/class-sessions', authMiddleware, check(async req => {
  if (req.user.role !== 'teacher') fail('forbidden', 403);
  await zoom.assertCapacity(req.user.id, req.body.intent?.minutes, req.body.participants?.length || 1);
}));
router.post('/class-sessions/:id/proposals', authMiddleware, check(async req => {
  const { session } = await zoom.visible(req.user, req.params.id, { owner: true });
  const seats = await M.ClassSessionParticipant.count({ where: { sessionId: session.id, status: { [require('sequelize').Op.ne]: 'cancelled' } } });
  await zoom.assertCapacity(session.teacherId, req.body.intent?.minutes, seats);
}));
router.post('/class-sessions/:id/proposals/:version/accept', authMiddleware, check(async req => {
  const { session } = await zoom.visible(req.user, req.params.id);
  const proposal = await M.ClassSessionProposal.findOne({ where: { sessionId: session.id, version: req.params.version } });
  const seats = await M.ClassSessionParticipant.count({ where: { sessionId: session.id, status: { [require('sequelize').Op.ne]: 'cancelled' } } });
  if (proposal?.status === 'pending') await zoom.assertCapacity(session.teacherId, proposal.minutes, seats);
}));
const offerCapacity = async req => {
  if (req.user.role !== 'teacher') fail('forbidden', 403);
  const version = await M.ClassPackageTemplateVersion.findByPk(Number(req.body.templateVersionId) || 0);
  const template = version && await M.ClassPackageTemplate.findByPk(version.templateId);
  if (template?.teacherId !== req.user.id) fail('not_found', 404);
  await zoom.assertCapacity(req.user.id, version.minutesPerSession, version.groupSize);
};
router.post('/conversations/:id/offers', authMiddleware, check(offerCapacity));
router.post('/class-offers/:id/replace', authMiddleware, check(offerCapacity));
router.post('/class-offers/:id/checkout', authMiddleware, check(async req => {
  const offer = await require('../services/classOffers').load(req.user, req.params.id);
  if (offer.buyerId !== req.user.id) fail('not_found', 404);
  await zoom.assertCapacity(offer.teacherId, offer.minutesPerSession, offer.snapshot.groupSize || 1);
}));
module.exports = router;
