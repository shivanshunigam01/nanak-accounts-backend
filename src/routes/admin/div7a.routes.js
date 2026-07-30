const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireModule } = require('../../middleware/roles');
const { getStore, saveStore } = require('../../controllers/admin/div7a.controller');

router.use(protect);
router.use(requireModule('div-7a'));

router.get('/', getStore);
router.put('/', saveStore);

module.exports = router;
