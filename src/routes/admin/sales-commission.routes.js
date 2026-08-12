const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireModule, requireModuleLevel } = require('../../middleware/roles');
const c = require('../../controllers/sales-commission.controller');

router.use(protect);
router.use(requireModule('sales-commission'));

const requireEdit = requireModuleLevel('sales-commission', 'edit');

router.get('/meta', c.getMeta);
router.get('/badges', c.getBadges);
router.get('/dashboard', c.getDashboard);
router.get('/staff', c.listStaff);

router.get('/deals', c.listDeals);
router.post('/deals', requireEdit, c.bookDeal);
router.get('/deals/:id', c.getDeal);
router.post('/deals/:id/sign', requireEdit, c.markSigned);
router.post('/deals/:id/milestone', requireEdit, c.setMilestone);
router.post('/deals/:id/payments', requireEdit, c.addPayment);
router.post('/deals/:id/cancel', requireEdit, c.cancelDeal);
router.post('/deals/:id/void', requireEdit, c.voidDeal);

router.get('/payments/awaiting', c.listAwaiting);
router.get('/payments/verified', c.listVerified);
router.post('/payments/:id/verify', requireEdit, c.verifyPayment);
router.post('/payments/:id/reject', requireEdit, c.rejectPayment);
router.post('/payments/:id/refund', requireEdit, c.refundPayment);

router.get('/ledger', c.getLedger);

router.get('/payout-batches', c.listBatches);
router.post('/payout-batches', requireEdit, c.createBatch);
router.get('/payout-batches/:id', c.getBatch);
router.post('/payout-batches/:id/advance', requireEdit, c.advanceBatch);
router.get('/payout-batches/:id/export.csv', c.exportBatchCsv);

router.get('/clawbacks', c.listClawbacks);
router.post('/clawbacks/:id/waive', requireEdit, c.waiveClawback);

router.get('/queries', c.listQueries);
router.post('/queries', requireEdit, c.raiseQuery);
router.post('/queries/:id/reply', requireEdit, c.replyQuery);
router.post('/queries/:id/resolve', requireEdit, c.resolveQuery);

router.get('/targets', c.listTargets);
router.post('/targets', requireEdit, c.setTarget);

router.get('/settings', c.getSettings);
router.patch('/settings', requireEdit, c.updateSettings);
router.post('/plans', requireEdit, c.addRate);

router.get('/audit', c.listAudit);
router.post('/preview', requireEdit, c.preview);
router.post('/acceptance-tests/run', requireEdit, c.runAcceptance);

module.exports = router;
