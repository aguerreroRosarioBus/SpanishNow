const express = require('express');
const router = express.Router();
const { verifyStripeEvent, handleStripeEvent, PaymentError } = require('../services/paymentService');

// Mounted in app.js BEFORE express.json(): the signature is computed over the exact bytes Stripe sent.
router.post('/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const event = verifyStripeEvent(req.body, req.header('stripe-signature'));
    const result = await handleStripeEvent(event);
    res.json({ received: true, ...(result.handled ? {} : { ignored: true }) });
  } catch (error) {
    if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message });
    // 500 makes Stripe retry later, which is what we want for a transient database failure.
    console.error('Stripe webhook failed:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
