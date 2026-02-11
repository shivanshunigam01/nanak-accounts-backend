const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { validate } = require('../../middleware/validate');
const {
  listTeam,
  createMember,
  updateMember,
  deleteMember,
  createValidators,
  updateValidators,
  deleteValidators,
} = require('../../controllers/admin/team.controller');

router.use(protect);
router.use(requireRole('admin', 'manager'));

router.get('/', listTeam);
router.post('/', createValidators, validate, createMember);
router.put('/:id', updateValidators, validate, updateMember);
router.delete('/:id', deleteValidators, validate, deleteMember);

module.exports = router;
