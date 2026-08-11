const { asyncHandler } = require('../middleware/asyncHandler');
const { isFullAccessRole } = require('../config/modules');
const { getPagination } = require('../utils/pagination');
const svc = require('../modules/sales-commission/service');
const { runAcceptanceTests } = require('../modules/sales-commission/acceptance');

function actor(req) {
  return req.user;
}

exports.getMeta = asyncHandler(async (req, res) => {
  const meta = await svc.getMeta();
  res.json({ success: true, meta });
});

exports.getBadges = asyncHandler(async (req, res) => {
  const badges = await svc.getBadges(actor(req));
  res.json({ success: true, badges });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const data = await svc.getDashboard(actor(req), { staffId: req.query.staffId });
  res.json({ success: true, ...data });
});

exports.listStaff = asyncHandler(async (req, res) => {
  const data = await svc.listStaffOptions(actor(req));
  res.json({ success: true, ...data });
});

exports.listDeals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listDeals(actor(req), {
    page,
    limit,
    skip,
    staffId: req.query.staffId,
    q: req.query.q,
  });
  res.json({ success: true, ...data });
});

exports.bookDeal = asyncHandler(async (req, res) => {
  const deal = await svc.bookDeal(actor(req), req.body);
  res.status(201).json({ success: true, deal });
});

exports.getDeal = asyncHandler(async (req, res) => {
  const deal = await svc.getDeal(actor(req), req.params.id);
  res.json({ success: true, deal });
});

exports.markSigned = asyncHandler(async (req, res) => {
  const deal = await svc.markSigned(actor(req), req.params.id, req.body.signedAt);
  res.json({ success: true, deal });
});

exports.setMilestone = asyncHandler(async (req, res) => {
  const deal = await svc.setMilestone(actor(req), req.params.id, req.body.field, req.body.date);
  res.json({ success: true, deal });
});

exports.addPayment = asyncHandler(async (req, res) => {
  const payment = await svc.addPayment(actor(req), req.params.id, req.body);
  res.status(201).json({ success: true, payment });
});

exports.cancelDeal = asyncHandler(async (req, res) => {
  const result = await svc.cancelDeal(actor(req), req.params.id, req.body);
  res.json({ success: true, ...result });
});

exports.voidDeal = asyncHandler(async (req, res) => {
  const deal = await svc.voidDeal(actor(req), req.params.id, req.body.reason);
  res.json({ success: true, deal });
});

exports.listAwaiting = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listPaymentsAwaiting(actor(req), { page, limit, skip });
  res.json({ success: true, ...data });
});

exports.listVerified = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listRecentlyVerified(actor(req), { page, limit, skip });
  res.json({ success: true, ...data });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
  const result = await svc.verifyPayment(actor(req), req.params.id);
  res.json({ success: true, ...result });
});

exports.rejectPayment = asyncHandler(async (req, res) => {
  const payment = await svc.rejectPayment(actor(req), req.params.id, req.body.reason);
  res.json({ success: true, payment });
});

exports.refundPayment = asyncHandler(async (req, res) => {
  const result = await svc.refundPayment(actor(req), req.params.id, req.body.reason);
  res.json({ success: true, ...result });
});

exports.getLedger = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.getLedger(actor(req), {
    staffId: req.query.staffId,
    page,
    limit,
    skip,
  });
  res.json({ success: true, ...data });
});

exports.listBatches = asyncHandler(async (req, res) => {
  const data = await svc.listBatches(actor(req));
  res.json({ success: true, ...data });
});

exports.getBatch = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.getBatch(actor(req), req.params.id, { page, limit, skip });
  res.json({ success: true, ...data });
});

exports.createBatch = asyncHandler(async (req, res) => {
  const batch = await svc.createBatch(actor(req), req.body.periodId);
  res.status(201).json({ success: true, batch });
});

exports.advanceBatch = asyncHandler(async (req, res) => {
  const batch = await svc.advanceBatch(actor(req), req.params.id, req.body);
  res.json({ success: true, batch });
});

exports.exportBatchCsv = asyncHandler(async (req, res) => {
  const { filename, csv } = await svc.exportBatchCsv(actor(req), req.params.id);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

exports.listClawbacks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listClawbacks(actor(req), { page, limit, skip });
  res.json({ success: true, ...data });
});

exports.waiveClawback = asyncHandler(async (req, res) => {
  const clawback = await svc.waiveClawback(actor(req), req.params.id, req.body);
  res.json({ success: true, clawback });
});

exports.listQueries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listQueries(actor(req), {
    page,
    limit,
    skip,
    status: req.query.status,
  });
  res.json({ success: true, ...data });
});

exports.raiseQuery = asyncHandler(async (req, res) => {
  const query = await svc.raiseQuery(actor(req), req.body);
  res.status(201).json({ success: true, query });
});

exports.replyQuery = asyncHandler(async (req, res) => {
  const query = await svc.replyQuery(actor(req), req.params.id, req.body);
  res.json({ success: true, query });
});

exports.resolveQuery = asyncHandler(async (req, res) => {
  const query = await svc.resolveQuery(actor(req), req.params.id);
  res.json({ success: true, query });
});

exports.listTargets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listTargets(actor(req), { page, limit, skip });
  res.json({ success: true, ...data });
});

exports.setTarget = asyncHandler(async (req, res) => {
  const target = await svc.setTarget(actor(req), req.body);
  res.status(201).json({ success: true, target });
});

exports.getSettings = asyncHandler(async (req, res) => {
  const data = await svc.getSettingsDto(actor(req));
  res.json({ success: true, ...data });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const settings = await svc.updateSettings(actor(req), req.body);
  res.json({ success: true, settings });
});

exports.addRate = asyncHandler(async (req, res) => {
  const plan = await svc.addRate(actor(req), req.body);
  res.status(201).json({ success: true, plan });
});

exports.listAudit = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const data = await svc.listAudit(actor(req), { page, limit, skip });
  res.json({ success: true, ...data });
});

exports.preview = asyncHandler(async (req, res) => {
  const preview = await svc.preview(req.body);
  res.json({ success: true, preview });
});

exports.runAcceptance = asyncHandler(async (req, res) => {
  if (!isFullAccessRole(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  const result = await runAcceptanceTests();
  res.json({ success: true, ...result });
});
