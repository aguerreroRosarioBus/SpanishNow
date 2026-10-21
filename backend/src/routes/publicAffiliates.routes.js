// Public side of affiliates: is a ?ref= code valid, and the private dashboard (the secret token is the only credential).
const express = require('express');
const router = express.Router();
const { Affiliate } = require('../models');
const affiliates = require('../services/affiliateService');

// Lets the web app avoid saving garbage codes. Reveals nothing but validity (no name, no teacher).
router.get('/affiliates/:code', async (req, res) => {
  try {
    const code = affiliates.normalizeCode(req.params.code);
    const affiliate = affiliates.CODE_PATTERN.test(code) ? await Affiliate.findOne({ where: { code }, attributes: ['id', 'active'] }) : null;
    res.json({ valid: Boolean(affiliate && affiliate.active) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Never any data of a buyer. Unknown, regenerated and inactive tokens are all the same 404.
router.get('/affiliate-dashboard/:token', async (req, res) => {
  try {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const affiliate = await affiliates.findByToken(req.params.token);
    if (!affiliate) return res.status(404).json({ error: 'Dashboard not found' });
    res.json(await affiliates.dashboardFor(affiliate));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
