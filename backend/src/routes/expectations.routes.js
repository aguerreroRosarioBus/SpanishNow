const express = require('express');
const { Course } = require('../models');
const { authMiddleware } = require('../middlewares/auth.middleware');
const sales = require('../services/salesExpectations');
const legal = require('../services/legalDocuments');
const router = express.Router();
router.get('/:id/expectations', authMiddleware, async (req, res, next) => {
  try {
    if (!legal.validId(req.params.id)) throw legal.fail(404, 'not_found');
    const course = await Course.findOne({ where: { id: req.params.id, teacherId: req.user.id } });
    if (!course || req.user.role !== 'teacher') throw legal.fail(404, 'not_found');
    res.json(await sales.read(course.id));
  } catch (e) { next(e); }
});
router.put('/:id/expectations', authMiddleware, async (req, res, next) => {
  try {
    if (req.impersonatedBy) throw legal.fail(403, 'forbidden');
    res.json(await sales.save(req.user, req.params.id, req.body));
  } catch (e) { next(e); }
});
module.exports = router;
