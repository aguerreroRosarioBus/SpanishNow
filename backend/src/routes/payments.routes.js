const express = require('express');
const router = express.Router();
const { verifyStripeEvent, handleStripeEvent, PaymentError } = require('../services/paymentService');
const hotmart = require('../services/hotmartService');
const teacherHotmart = require('../services/teacherHotmart');

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

const hotmartJson = express.json({ limit: '1mb' });

router.post('/hotmart/webhook/teachers/:publicId', hotmartJson, async (req, res) => {
  try {
    const result = await teacherHotmart.receive(req.params.publicId, req.header('x-hotmart-hottok'), req.body);
    if (result.status) return res.sendStatus(result.status);
    res.json(result.test ? { received: true, test: true } : { received: true, ...(result.handled ? {} : { ignored: true }) });
  } catch (error) {
    console.error('Teacher Hotmart webhook failed:', error.name);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Hotmart purchase webhook (2.0.0). Answers 200 to everything it does not handle: Hotmart turns the webhook off after errors.
router.post('/hotmart/webhook', hotmartJson, async (req, res) => {
  try {
    hotmart.verifyHottok(req.header('x-hotmart-hottok'), req.body);
    const result = await hotmart.handleEvent(req.body);
    res.json({ received: true, ...(result.handled ? {} : { ignored: true }) });
  } catch (error) {
    if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message });
    // 500 makes Hotmart retry later (transient database failure).
    console.error('Hotmart webhook failed:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
