const path = require('path');
const { body } = require('express-validator');
const Submission = require('../models/Submission');
const { asyncHandler } = require('../middleware/asyncHandler');
const { generateOrderNumber } = require('../utils/orderNumber');
const { getServiceName } = require('../utils/serviceMap');
const { notifyStaffNewSubmission } = require('../services/emailService');
const { getStripe } = require('../config/stripe');

const submitFormValidators = [
  body('serviceKey').isString().notEmpty(),
  body('customerName').isString().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isString().notEmpty(),
  body('packageType').isString().notEmpty(),
  body('amount').isNumeric(),
];

const submitForm = asyncHandler(async (req, res) => {
  const {
    serviceKey,
    customerName,
    email,
    phone,
    formData,
    packageType,
    amount,
  } = req.body;

  const orderNumber = generateOrderNumber('NA');

  const submission = await Submission.create({
    orderNumber,
    serviceKey,
    serviceName: getServiceName(serviceKey),
    customerName,
    email,
    phone,
    formData: formData || {},
    selections: {},
    packageType,
    amount: Number(amount),
    paymentStatus: 'pending',
    jobStatus: 'new',
    activityLog: [
      {
        action: 'created',
        description: 'Submission received',
        doneBy: 'System',
        timestamp: new Date(),
      },
    ],
  });

  // Notify staff (best-effort)
  try {
    await notifyStaffNewSubmission(submission);
  } catch (e) {
    // do not fail request due to email
    console.warn('Email notifyStaffNewSubmission failed:', e.message);
  }

  res.status(201).json({
    success: true,
    orderNumber: submission.orderNumber,
    submissionId: submission._id,
    message: 'Submission received successfully',
  });
});

/**
 * POST /api/checkout/submit
 * multipart/form-data with "payload" JSON string + files
 */
const checkoutSubmit = asyncHandler(async (req, res) => {
  const payloadStr = req.body.payload;
  if (!payloadStr) {
    return res.status(400).json({ success: false, message: 'Missing payload' });
  }

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid payload JSON' });
  }

  const { serviceKey, customer, selections, pricing, meta } = payload;
  if (!serviceKey) return res.status(400).json({ success: false, message: 'serviceKey required' });
  if (!customer || !customer.email) return res.status(400).json({ success: false, message: 'customer.email required' });
  if (!pricing || typeof pricing.total !== 'number') return res.status(400).json({ success: false, message: 'pricing.total required' });

  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || payload.customerName || 'Customer';
  const phone = customer.phone || payload.phone || '';

  const orderNumber = generateOrderNumber('NA');

  const files = (req.files || []).map((f) => ({
    field: f.fieldname,
    fileName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    url: `/uploads/${path.basename(f.path)}`,
  }));

  const submission = await Submission.create({
    orderNumber,
    serviceKey,
    serviceName: getServiceName(serviceKey),
    customerName,
    email: customer.email,
    phone,
    formData: { ...customer, meta },
    selections: selections || {},
    packageType: selections?.packageType || payload.packageType || 'Standard',
    amount: Number(pricing.total),
    paymentStatus: 'pending_payment',
    jobStatus: 'new',
    files,
    activityLog: [
      { action: 'created', description: 'Submission received', doneBy: 'System', timestamp: new Date() },
    ],
  });

  const stripe = getStripe();
  const origin = process.env.FRONTEND_ORIGIN || process.env.ADMIN_URL || 'http://localhost:5173';

  const session = await stripe.checkout.sessions.create({
    customer_email: customer.email,
    line_items: [
      {
        price_data: {
          currency: (process.env.CURRENCY || 'aud').toLowerCase(),
          unit_amount: Math.round(Number(pricing.total) * 100),
          product_data: {
            name: getServiceName(serviceKey),
            description: `Nanak Accounts - ${getServiceName(serviceKey)}`,
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment-cancelled?submission_id=${submission._id}`,
    metadata: {
      submission_id: String(submission._id),
      service_key: serviceKey,
      order_number: orderNumber,
    },
  });

  submission.stripeCheckoutSessionId = session.id;
  await submission.save();

  res.json({
    success: true,
    submissionId: submission._id,
    stripeCheckoutUrl: session.url,
    stripeSessionId: session.id,
  });
});

const createCheckoutSession = asyncHandler(async (req, res) => {
  const { submissionId, amount, currency, serviceName, customerEmail } = req.body;
  if (!submissionId || !amount || !customerEmail) {
    return res.status(400).json({ success: false, message: 'submissionId, amount, customerEmail required' });
  }

  const submission = await Submission.findById(submissionId);
  if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

  const stripe = getStripe();
  const origin = process.env.FRONTEND_ORIGIN || process.env.ADMIN_URL || 'http://localhost:5173';

  const session = await stripe.checkout.sessions.create({
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: (currency || process.env.CURRENCY || 'aud').toLowerCase(),
          unit_amount: Math.round(Number(amount) * 100),
          product_data: {
            name: serviceName || submission.serviceName,
            description: `Nanak Accounts - ${serviceName || submission.serviceName}`,
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment-cancelled?submission_id=${submission._id}`,
    metadata: { submission_id: String(submission._id) },
  });

  submission.stripeCheckoutSessionId = session.id;
  await submission.save();

  res.json({ url: session.url, sessionId: session.id });
});

module.exports = {
  submitForm,
  submitFormValidators,
  checkoutSubmit,
  createCheckoutSession,
};
