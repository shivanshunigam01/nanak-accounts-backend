const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireModule, requireModuleLevel } = require('../../middleware/roles');
const { getStore, saveStore } = require('../../controllers/admin/commandCentre.controller');

router.use(protect);
router.use(requireModule('command-centre'));

router.get('/', getStore);
router.put('/', requireModuleLevel('command-centre', 'edit'), saveStore);

module.exports = router;
