const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const {
  listSubmissions,
  getSubmissionById,
  assignSubmission,
  updateStatus,
  addNote,
  requestDocument,
  emailToStaff,
  assignValidators,
  statusValidators,
  updatePaymentStatus,
  noteValidators,
  requestDocumentValidators,
  emailToStaffValidators,
} = require('../../controllers/admin/submissions.controller');

router.use(protect);
router.use(requireRole('admin', 'owner', 'manager', 'staff'));

router.get('/', listSubmissions);
router.get('/:id', getSubmissionById);

router.put('/:id/assign', requireRole('admin', 'owner', 'manager', 'staff'), assignValidators, validate, assignSubmission);
router.put('/:id/status', statusValidators, validate, updateStatus);
router.post('/:id/notes', noteValidators, validate, addNote);
router.post('/:id/request-document', requestDocumentValidators, validate, requestDocument);
router.post('/:id/email-to-staff', requireRole('admin', 'owner', 'manager', 'staff'), emailToStaffValidators, validate, emailToStaff);
router.patch('/:id/payment-status', requireRole('admin', 'owner', 'manager', 'staff'), updatePaymentStatus);
router.patch(
  '/:id/job-status',
  requireRole('admin', 'owner', 'manager', 'staff'),
  statusValidators,
  validate,
  updateStatus
);
module.exports = router;

