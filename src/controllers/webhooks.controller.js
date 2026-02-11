const Submission = require('../models/Submission');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getStripe } = require('../config/stripe');

async function addActivity(submission, activity) {
  submission.activityLog.push({
    action: activity.action,
    description: activity.description,
    doneBy: activity.doneBy,
    timestamp: activity.timestamp || new Date(),
  });
  await submission.save();
  await ActivityLog.create({
    submissionId: submission._id,
    action: activity.action,
    description: activity.description,
    doneBy: activity.doneBy,
    details: activity.details || {},
    timestamp: activity.timestamp || new Date(),
  }).catch(() => {});
}

const stripeWebhook = asyncHandler(async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ success: false, message: 'STRIPE_WEBHOOK_SECRET missing' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    err.type = 'StripeSignatureVerificationError';
    throw err;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const submissionId = session.metadata?.submission_id;
        if (submissionId) {
          const submission = await Submission.findById(submissionId);
          if (submission) {
            submission.paymentStatus = 'paid';
            submission.paymentIntentId = session.payment_intent || submission.paymentIntentId;
            submission.stripeCheckoutSessionId = session.id || submission.stripeCheckoutSessionId;
            await addActivity(submission, {
              action: 'payment',
              description: `Payment received — $${(session.amount_total || 0) / 100}`,
              doneBy: 'Stripe',
              details: {
                event: event.type,
                amount: (session.amount_total || 0) / 100,
                currency: session.currency,
                payment_intent: session.payment_intent,
              },
            });
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const submission = await Submission.findOne({ paymentIntentId: pi.id });
        if (submission) {
          submission.paymentStatus = 'paid';
          await addActivity(submission, {
            action: 'payment',
            description: `Payment received — $${(pi.amount_received || 0) / 100}`,
            doneBy: 'Stripe',
            details: { event: event.type, payment_intent: pi.id },
          });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const submission = await Submission.findOne({ paymentIntentId: pi.id });
        if (submission) {
          submission.paymentStatus = 'failed';
          await addActivity(submission, {
            action: 'payment',
            description: 'Payment failed',
            doneBy: 'Stripe',
            details: { event: event.type, payment_intent: pi.id },
          });
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const submissionId = session.metadata?.submission_id;
        if (submissionId) {
          const submission = await Submission.findById(submissionId);
          if (submission) {
            submission.paymentStatus = 'failed';
            await addActivity(submission, {
              action: 'payment',
              description: 'Payment failed — session expired',
              doneBy: 'Stripe',
              details: { event: event.type },
            });
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        // Try locate by payment intent
        const piId = charge.payment_intent;
        const submission = piId ? await Submission.findOne({ paymentIntentId: piId }) : null;
        if (submission) {
          submission.paymentStatus = 'refunded';
          await addActivity(submission, {
            action: 'payment',
            description: `Refund processed — $${(charge.amount_refunded || 0) / 100}`,
            doneBy: 'Stripe',
            details: { event: event.type, charge: charge.id },
          });
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ received: true });
  }
});

module.exports = { stripeWebhook };
