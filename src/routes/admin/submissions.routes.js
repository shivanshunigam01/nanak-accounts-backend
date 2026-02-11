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
  noteValidators,
  requestDocumentValidators,
  emailToStaffValidators,
} = require('../../controllers/admin/submissions.controller');

router.use(protect);
router.use(requireRole('admin', 'manager', 'staff'));

router.get('/', listSubmissions);
router.get('/:id', getSubmissionById);

router.put('/:id/assign', requireRole('admin','manager'), assignValidators, validate, assignSubmission);
router.put('/:id/status', statusValidators, validate, updateStatus);
router.post('/:id/notes', noteValidators, validate, addNote);
router.post('/:id/request-document', requestDocumentValidators, validate, requestDocument);
router.post('/:id/email-to-staff', requireRole('admin','manager'), emailToStaffValidators, validate, emailToStaff);

module.exports = router;
