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
// 🔥 Universal email resolver for all services
function resolvePrimaryEmail(customer) {
  if (!customer) return null;

  // Direct known fields
  if (customer.email) return customer.email;
  if (customer.appointorEmail) return customer.appointorEmail;
  if (customer.iaContactEmail) return customer.iaContactEmail;

  // Charity CLG
  if (customer.clgDirectors?.[0]?.email)
    return customer.clgDirectors[0].email;

  if (customer.clgMembers?.[0]?.email)
    return customer.clgMembers[0].email;

  // Trust / Company / SMSF patterns
  if (customer.directors?.[0]?.email)
    return customer.directors[0].email;

  if (customer.shareholders?.[0]?.email)
    return customer.shareholders[0].email;

  if (customer.beneficiaries?.[0]?.email)
    return customer.beneficiaries[0].email;

  if (customer.iaCommitteeMembers?.[0]?.email)
    return customer.iaCommitteeMembers[0].email;

  // 🔥 Final fallback – deep scan for first valid email
  const stack = [customer];

  while (stack.length) {
    const current = stack.pop();
    for (const key in current) {
      const value = current[key];

      if (
        typeof value === "string" &&
        value.includes("@") &&
        value.includes(".")
      ) {
        return value;
      }

      if (typeof value === "object" && value !== null) {
        stack.push(value);
      }
    }
  }

  return null;
}

function resolvePrimaryPhone(customer) {
  if (!customer) return null;

  if (customer.phone) return customer.phone;
  if (customer.appointorPhone) return customer.appointorPhone;
  if (customer.iaContactPhone) return customer.iaContactPhone;

  // Charity CLG
  if (customer.clgDirectors?.[0]?.phone)
    return customer.clgDirectors[0].phone;

  if (customer.clgMembers?.[0]?.phone)
    return customer.clgMembers[0].phone;

  // Trust / Company / SMSF
  if (customer.directors?.[0]?.phone)
    return customer.directors[0].phone;

  if (customer.shareholders?.[0]?.phone)
    return customer.shareholders[0].phone;

  if (customer.beneficiaries?.[0]?.phone)
    return customer.beneficiaries[0].phone;

  if (customer.iaCommitteeMembers?.[0]?.phone)
    return customer.iaCommitteeMembers[0].phone;

  // 🔥 Deep scan fallback
  const stack = [customer];

  while (stack.length) {
    const current = stack.pop();
    for (const key in current) {
      const value = current[key];

      if (
        typeof value === "string" &&
        value.match(/^\d{6,}$/) // basic phone-like check
      ) {
        return value;
      }

      if (typeof value === "object" && value !== null) {
        stack.push(value);
      }
    }
  }

  return null;
}

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

  const { serviceKey, customer = {}, selections = {}, pricing, meta } = payload;

  if (!serviceKey) {
    return res.status(400).json({ success: false, message: 'serviceKey required' });
  }

  if (!pricing || typeof pricing.total !== 'number') {
    return res.status(400).json({ success: false, message: 'pricing.total required' });
  }


// 🔥 Resolve primary email dynamically
let primaryEmail = resolvePrimaryEmail(customer);

// 🔥 Bare Trust fallback logic
if (!primaryEmail && serviceKey === "bare_trust") {
  primaryEmail =
    customer.email ||
    customer.cardholderEmail ||
    (customer.signature && customer.signature.includes("@")
      ? customer.signature
      : null);
}

// 🔥 Absolute fallback (system placeholder)
if (!primaryEmail && serviceKey === "bare_trust") {
  primaryEmail = "baretrust@system.local";
}

if (!primaryEmail) {
  return res.status(400).json({
    success: false,
    message: 'customer.email required',
  });
}



  if (!primaryEmail) {
    return res.status(400).json({
      success: false,
      message: 'customer.email required',
    });
  }

  // 🔥 Resolve primary phone dynamically
let primaryPhone = resolvePrimaryPhone(customer);

// 🔥 If phone not found, assign system fallback
if (!primaryPhone) {
  primaryPhone = "0000000000"; // fallback to satisfy mongoose required field
}


  // 🔥 Resolve customer name dynamically
const customerName =
  [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
  [customer.appointorFirstName, customer.appointorLastName].filter(Boolean).join(' ') ||
  [customer.iaContactFirstName, customer.iaContactLastName].filter(Boolean).join(' ') ||
  customer.directors?.[0]?.fullName ||
  customer.iaCommitteeMembers?.[0]?.firstName + ' ' + customer.iaCommitteeMembers?.[0]?.lastName ||
  payload.customerName ||
  'Customer';


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
    email: primaryEmail,
    phone: primaryPhone,
    formData: { ...customer, meta },
    selections,
    packageType: selections?.packageType || payload.packageType || 'Standard',
    amount: Number(pricing.total),
    paymentStatus: Number(pricing.total) === 0 ? 'pending' : 'pending_payment',
    jobStatus: 'new',
    files,
    activityLog: [
      {
        action: 'created',
        description: 'Submission received',
        doneBy: 'System',
        timestamp: new Date(),
      },
    ],
  });

  // ✅ If free consultation (total = 0), skip Stripe
  if (Number(pricing.total) === 0) {
    return res.json({
      success: true,
      submissionId: submission._id,
      message: 'Free consultation submitted successfully',
    });
  }

  const stripe = getStripe();
  const origin =
    process.env.FRONTEND_ORIGIN ||
    process.env.ADMIN_URL ||
    'http://localhost:5173';

  const session = await stripe.checkout.sessions.create({
    customer_email: primaryEmail,
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
