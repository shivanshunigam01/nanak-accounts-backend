const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { summary, conversionFunnel, staffWorkload, servicePopularity } = require('../../controllers/admin/reports.controller');

router.use(protect);
router.use(requireRole('admin', 'manager'));

router.get('/summary', summary);
router.get('/conversion-funnel', conversionFunnel);
router.get('/staff-workload', staffWorkload);
router.get('/service-popularity', servicePopularity);

module.exports = router;
