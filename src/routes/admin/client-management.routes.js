const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireModule, requireModuleLevel } = require('../../middleware/roles');
const c = require('../../controllers/client-management.controller');

router.use(protect);
router.use(requireModule('client-management'));

router.get('/meta', c.getMeta);
router.get('/dashboard', requireModule('cm-dashboard'), c.getDashboard);

router.get('/clients', requireModule('cm-clients'), c.listClients);
router.post('/clients', requireModule('cm-clients'), c.createClient);
router.post('/clients/import', requireModuleLevel('cm-import', 'edit'), c.importClients);
router.get('/clients-export', requireModule('cm-import'), c.exportClients);
router.get('/clients/:id', requireModule('cm-clients'), c.getClient);
router.patch('/clients/:id', requireModule('cm-clients'), c.updateClient);

router.get('/allocation', requireModule('cm-allocation'), c.getAllocation);
router.get('/groups', requireModule('cm-groups'), c.listGroups);
router.post('/groups', requireModuleLevel('cm-groups', 'edit'), c.createGroup);
router.patch('/groups/:id', requireModuleLevel('cm-groups', 'edit'), c.renameGroup);
router.post('/groups/link', requireModuleLevel('cm-groups', 'edit'), c.linkGroup);
router.post('/groups/consolidate', requireModuleLevel('cm-groups', 'edit'), c.consolidateGroup);

router.get('/payments', requireModule('cm-payments'), c.getPayments);
router.get('/payments/export', requireModule('cm-payments'), c.exportPayments);
router.get('/payments/billing-gaps-export', requireModule('cm-payments'), c.exportBillingGaps);
router.post('/payments/fee-uplift', requireModuleLevel('cm-payments', 'edit'), c.applyFeeUplift);
router.post('/payments/preview-xero', requireModuleLevel('cm-payments', 'edit'), c.previewXero);
router.post('/payments/reconcile-xero', requireModuleLevel('cm-payments', 'edit'), c.reconcileXero);

router.get('/payroll', requireModule('cm-payroll'), c.getPayroll);
router.post('/payroll/run', requireModule('cm-clients'), c.updatePayrollRun);
router.get('/super', requireModule('cm-super'), c.getSuper);

router.get('/lodgement', requireModule('cm-lodgement'), c.getLodgement);
router.get('/reminders', requireModule('cm-reminders'), c.getReminders);
router.post('/reminders/export', requireModuleLevel('cm-reminders', 'edit'), c.exportReminders);

router.patch('/settings', requireModuleLevel('client-management', 'edit'), c.updateSettings);

router.get('/periods', requireModule('cm-periods'), c.getPeriods);
router.patch('/periods/:periodId', requireModuleLevel('cm-periods', 'edit'), c.updatePeriod);
router.post('/periods/:periodId/lock', requireModuleLevel('cm-periods', 'full'), c.lockPeriod);
router.post('/periods/:periodId/unlock', requireModuleLevel('cm-periods', 'full'), c.unlockPeriod);
router.post('/fy/start', requireModuleLevel('cm-periods', 'full'), c.startFY);
router.post('/fy/working', requireModuleLevel('cm-periods', 'edit'), c.setWorkingYear);
router.post('/fy/advance-quarter', requireModuleLevel('cm-periods', 'full'), c.advanceQuarter);

router.post('/seed', requireModuleLevel('client-management', 'full'), c.seed);
router.post('/seed/clear', requireModuleLevel('client-management', 'full'), c.clearSeed);

router.get('/onboarding/meta', requireModule('cm-onboarding'), c.getOnboardingMeta);
router.get('/onboarding/dashboard', requireModule('cm-onboarding'), c.getOnboardingDashboard);
router.get('/onboarding/client-search', requireModule('cm-onboarding'), c.searchOnboardingClients);
router.get('/onboarding/manager-files', requireModule('cm-onboarding'), c.getOnboardingManagerFiles);
router.get('/onboarding/entities', requireModule('cm-onboarding'), c.listOnboardingEntities);
router.post('/onboarding/entities', requireModuleLevel('cm-onboarding', 'edit'), c.createOnboardingEntity);
router.get('/onboarding/entities/:id', requireModule('cm-onboarding'), c.getOnboardingEntity);
router.patch('/onboarding/entities/:id', requireModuleLevel('cm-onboarding', 'edit'), c.updateOnboardingEntity);
router.post('/onboarding/seed', requireModuleLevel('client-management', 'full'), c.seedOnboarding);

module.exports = router;
