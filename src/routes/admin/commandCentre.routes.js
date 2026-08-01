const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { getStore, saveStore } = require('../../controllers/admin/commandCentre.controller');

router.use(protect);
router.use(requireRole('admin', 'owner'));

router.get('/', getStore);
router.put('/', saveStore);

module.exports = router;
