const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireModule } = require('../../middleware/roles');
const c = require('../../controllers/client-management.controller');

router.use(protect);
router.use(requireModule('client-management'));

router.get('/meta', c.getMeta);
router.get('/dashboard', c.getDashboard);

router.get('/clients', c.listClients);
router.post('/clients', c.createClient);
router.post('/clients/import', c.importClients);
router.get('/clients-export', c.exportClients);
router.get('/clients/:id', c.getClient);
router.patch('/clients/:id', c.updateClient);

router.get('/allocation', c.getAllocation);
router.get('/groups', c.listGroups);
router.post('/groups', c.createGroup);
router.post('/groups/link', c.linkGroup);
router.post('/groups/consolidate', c.consolidateGroup);

router.get('/payments', c.getPayments);
router.get('/payments/export', c.exportPayments);
router.get('/payments/billing-gaps-export', c.exportBillingGaps);
router.post('/payments/fee-uplift', c.applyFeeUplift);
router.post('/payments/preview-xero', c.previewXero);
router.post('/payments/reconcile-xero', c.reconcileXero);

router.get('/payroll', c.getPayroll);
router.post('/payroll/run', c.updatePayrollRun);
router.get('/super', c.getSuper);

router.get('/lodgement', c.getLodgement);
router.get('/reminders', c.getReminders);
router.post('/reminders/export', c.exportReminders);

router.patch('/settings', c.updateSettings);

router.get('/periods', c.getPeriods);
router.patch('/periods/:periodId', c.updatePeriod);
router.post('/periods/:periodId/lock', c.lockPeriod);
router.post('/periods/:periodId/unlock', c.unlockPeriod);
router.post('/fy/start', c.startFY);
router.post('/fy/working', c.setWorkingYear);
router.post('/fy/advance-quarter', c.advanceQuarter);

router.post('/seed', c.seed);
router.post('/seed/clear', c.clearSeed);

module.exports = router;
