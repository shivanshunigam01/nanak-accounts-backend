const Stripe = require('stripe');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing in .env');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

module.exports = { getStripe };
