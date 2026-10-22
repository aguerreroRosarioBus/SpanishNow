const router = require('express').Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { serializePreferences, updatePreferences } = require('../services/userPreferences');

router.use(authMiddleware);

router.get('/', (req, res) => res.json(serializePreferences(req.user)));

router.patch('/', async (req, res, next) => {
  try {
    res.json(await updatePreferences(req.user.id, req.body));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message, code: error.code, params: error.params });
    next(error);
  }
});

module.exports = router;
