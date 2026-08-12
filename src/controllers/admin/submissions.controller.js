const { body, param } = require('express-validator');
const Submission = require('../../models/Submission');
const User = require('../../models/User');
const ActivityLog = require('../../models/ActivityLog');
const { asyncHandler } = require('../../middleware/asyncHandler');
const { getPagination } = require('../../utils/pagination');
const {
  notifyStaffAssigned,
  notifyCustomerCompleted,
  requestDocumentFromCustomer,
  emailSubmissionToStaff,
} = require('../../services/emailService');

function canAccessSubmission(user, submission) {
  if (!user) return false;

  if (user.role === 'admin' || user.role === 'owner' || user.role === 'manager' || user.role === 'staff') {
    return true;
  }

  return false;
}

async function logActivity(submissionId, action, description, doneBy, details = {}) {
  await ActivityLog.create({ submissionId, action, description, doneBy, details, timestamp: new Date() }).catch(() => {});
}

const listSubmissions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const {
    search,
    paymentStatus,
    serviceKey,
    jobStatus,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = {};

  // Expand common status aliases so dashboard filters match the counts.
  if (paymentStatus === 'pending') {
    filter.paymentStatus = { $in: ['pending', 'pending_payment'] };
  } else if (paymentStatus === 'failed') {
    filter.paymentStatus = { $in: ['failed', 'payment_failed'] };
  } else if (paymentStatus === 'paid') {
    filter.paymentStatus = { $in: ['paid', 'payment_complete'] };
  } else if (paymentStatus) {
    filter.paymentStatus = paymentStatus;
  }
  if (serviceKey) filter.serviceKey = serviceKey;
  if (jobStatus) filter.jobStatus = jobStatus;

  if (req.user.role === 'staff') {
    filter.assignedTo = req.user._id;
  }

  if (search) {
    filter.$text = { $search: String(search) };
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .populate('assignedTo', '_id name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Submission.countDocuments(filter),
  ]);

  res.json({
    submissions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

const getSubmissionById = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id).populate('assignedTo', '_id name email role');
  if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

  if (!canAccessSubmission(req.user, submission)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  res.json(submission);
});

const assignValidators = [
  body('assignedTo').isString().notEmpty(),
  param('id').isString().notEmpty(),
];

const assignSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);
  if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

  if (!(req.user.role === 'admin' || req.user.role === 'owner' || req.user.role === 'manager')) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const staffId = req.body.assignedTo;
  const staff = await User.findById(staffId);
  if (!staff || !staff.active) return res.status(400).json({ success: false, message: 'Invalid assignee' });

  submission.assignedTo = staff._id;
  submission.jobStatus = 'assigned';

  const activity = {
    action: 'assigned',
    description: `Assigned to ${staff.name}`,
    doneBy: req.user.name,
    timestamp: new Date(),
  };

  submission.activityLog.push(activity);
  await submission.save();
  await logActivity(submission._id, activity.action, activity.description, activity.doneBy, { assignedTo: staff._id });

  // Email (best-effort)
  try {
    await notifyStaffAssigned(submission, staff.email, staff.name, req.user.name);
  } catch (e) {
    console.warn('notifyStaffAssigned failed:', e.message);
  }

  res.json({ success: true, submission, activityLog: activity });
});

const statusValidators = [
  body('jobStatus')
    .isIn([
      'new',
      'assigned',
      'in_progress',
      'contacted',
      'awaiting_docs',
      'completed',
      'cancelled'
    ])
    .withMessage('Invalid status'),
  param('id').isString().notEmpty(),
];

const updateStatus = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);

  if (!submission) {
    return res.status(404).json({
      success: false,
      message: 'Submission not found',
    });
  }

  if (!canAccessSubmission(req.user, submission)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden',
    });
  }

  const { jobStatus } = req.body;

  submission.jobStatus = jobStatus;

  submission.activityLog.push({
    action: 'job_status',
    description: `Job status changed to ${jobStatus.replace(/_/g, ' ')}`,
    doneBy: req.user.name,
    timestamp: new Date(),
  });

  await submission.save();

  res.json({
    success: true,
    submission,
  });
});

const noteValidators = [
  body('note').isString().notEmpty(),
  param('id').isString().notEmpty(),
];

const addNote = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);
  if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

  if (!canAccessSubmission(req.user, submission)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { note } = req.body;
  const activity = {
    action: 'note',
    description: note,
    doneBy: req.user.name,
    timestamp: new Date(),
  };
  submission.activityLog.push(activity);
  await submission.save();
  await logActivity(submission._id, activity.action, activity.description, activity.doneBy);

  res.status(201).json({ success: true, activityLog: { ...activity, _id: undefined } });
});

const requestDocumentValidators = [
  body('documentType').isString().notEmpty(),
  body('message').isString().notEmpty(),
  param('id').isString().notEmpty(),
];

const requestDocument = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);
  if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

  if (!(req.user.role === 'admin' || req.user.role === 'owner' || req.user.role === 'manager' || canAccessSubmission(req.user, submission))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { documentType, message } = req.body;

  // Email (best-effort)
  try {
    await requestDocumentFromCustomer(submission, documentType, message);
  } catch (e) {
    console.warn('requestDocumentFromCustomer failed:', e.message);
  }

  const activity = {
    action: 'document_request',
    description: `Document request sent — ${documentType}`,
    doneBy: req.user.name,
    timestamp: new Date(),
  };

  submission.activityLog.push(activity);
  await submission.save();
  await logActivity(submission._id, activity.action, activity.description, activity.doneBy, { documentType });

  res.json({
    success: true,
    message: `Document request email sent to ${submission.email}`,
    activityLog: activity,
  });
});

const emailToStaffValidators = [
  body('staffId').isString().notEmpty(),
  body('message').optional().isString(),
  param('id').isString().notEmpty(),
];

const emailToStaff = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);
  if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

  if (!(req.user.role === 'admin' || req.user.role === 'owner' || req.user.role === 'manager')) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const staff = await User.findById(req.body.staffId);
  if (!staff || !staff.active) return res.status(400).json({ success: false, message: 'Invalid staff member' });

  const customMessage = req.body.message || '';

  try {
    await emailSubmissionToStaff(submission, staff.email, staff.name, customMessage);
  } catch (e) {
    console.warn('emailSubmissionToStaff failed:', e.message);
  }

  const activity = {
    action: 'email_sent',
    description: `Submission emailed to ${staff.name}`,
    doneBy: req.user.name,
    timestamp: new Date(),
  };

  submission.activityLog.push(activity);
  await submission.save();
  await logActivity(submission._id, activity.action, activity.description, activity.doneBy, { staffId: staff._id });

  res.json({ success: true, message: `Submission emailed to ${staff.name}` });
});


const updatePaymentStatus = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.id);

  if (!submission) {
    return res.status(404).json({ success: false, message: 'Submission not found' });
  }

  if (!(req.user.role === 'admin' || req.user.role === 'owner' || req.user.role === 'manager' || req.user.role === 'staff')) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { paymentStatus } = req.body;

  submission.paymentStatus = paymentStatus;

  // 🔥 ADD THIS
  if (paymentStatus === "payment_complete") {
    submission.paymentCompletedAt = new Date();
  }

  submission.activityLog.push({
    action: 'payment_status',
    description: `Payment status changed to ${paymentStatus}`,
    doneBy: req.user.name,
    timestamp: new Date(),
  });

  await submission.save();

  res.json({ success: true, submission });
});

const deleteSubmission = asyncHandler(async (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Only the owner can delete submissions',
    });
  }

  const submission = await Submission.findById(req.params.id);
  if (!submission) {
    return res.status(404).json({ success: false, message: 'Submission not found' });
  }

  const snapshot = {
    orderNumber: submission.orderNumber,
    email: submission.email,
    serviceKey: submission.serviceKey,
  };

  await ActivityLog.create({
    submissionId: submission._id,
    action: 'deleted',
    description: `Submission ${submission.orderNumber || submission._id} permanently deleted`,
    doneBy: req.user.name,
    details: snapshot,
    timestamp: new Date(),
  }).catch(() => {});

  await Submission.deleteOne({ _id: submission._id });

  res.json({
    success: true,
    message: 'Submission deleted',
    deleted: snapshot,
  });
});

module.exports = {
  listSubmissions,
  getSubmissionById,
  assignSubmission,
  updateStatus,
  addNote,
  requestDocument,
  emailToStaff,
  assignValidators,
  statusValidators,
  noteValidators,
  requestDocumentValidators,
  emailToStaffValidators,
  updatePaymentStatus,
  deleteSubmission,
};
