const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { getStats, getRevenueChart, getServiceDistribution, getRecentSubmissions } = require('../../controllers/admin/dashboard.controller');

router.use(protect);

router.get('/stats', getStats);
router.get('/revenue-chart', getRevenueChart);
router.get('/service-distribution', getServiceDistribution);
router.get('/recent-submissions', getRecentSubmissions);

module.exports = router;
