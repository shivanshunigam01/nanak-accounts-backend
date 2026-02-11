const router = require('express').Router();
const express = require('express');
const { stripeWebhook } = require('../controllers/webhooks.controller');

// Stripe requires the raw body to verify signatures.
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
// Aliases for alternate frontend docs
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);

module.exports = router;
