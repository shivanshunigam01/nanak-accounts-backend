const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const {
  listSessions,
  getSession,
  createSession,
  deleteSession,
  listValidators,
  getValidators,
  createValidators,
  deleteValidators,
} = require('../../controllers/admin/tool-sessions.controller');

router.use(protect);
router.use(requireRole('admin', 'owner', 'manager', 'staff'));

router.get('/', listValidators, validate, listSessions);
router.get('/:id', getValidators, validate, getSession);
router.post('/', createValidators, validate, createSession);
router.delete('/:id', deleteValidators, validate, deleteSession);

module.exports = router;
