const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireRole, requireModule } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const {
  listTeam,
  createMember,
  updateMember,
  deleteMember,
  applyRoleDefaults,
  createValidators,
  updateValidators,
  deleteValidators,
} = require('../../controllers/admin/team.controller');

router.use(protect);
router.use(requireRole('admin', 'owner', 'manager', 'staff'));

// Listing stays open to all roles (used for assignment dropdowns).
router.get('/', listTeam);
// Owner-only: apply Excel role-matrix defaults to all members.
router.post('/apply-role-defaults', requireRole('admin', 'owner'), applyRoleDefaults);
// Mutations require access to the Team module (owners by default).
router.post('/', requireModule('team'), createValidators, validate, createMember);
router.put('/:id', requireModule('team'), updateValidators, validate, updateMember);
router.delete('/:id', requireModule('team'), deleteValidators, validate, deleteMember);

module.exports = router;
