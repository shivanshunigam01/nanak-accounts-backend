const { asyncHandler } = require('../middleware/asyncHandler');
const { isFullAccessRole } = require('../config/modules');
const svc = require('../modules/client-management/service');
const onboardingSvc = require('../modules/client-management/onboarding.service');
const { seedClientManagement, clearClientManagement } = require('../seeds/clientManagement.seed');

exports.getMeta = asyncHandler(async (req, res) => {
  const meta = await svc.getMeta(req.user);
  res.json({ success: true, meta });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const data = await svc.getDashboard(req.user);
  res.json({ success: true, ...data });
});

exports.listClients = asyncHandler(async (req, res) => {
  const data = await svc.listClients(req.user, req.query);
  res.json({ success: true, ...data });
});

exports.getClient = asyncHandler(async (req, res) => {
  const data = await svc.getClient(req.user, req.params.id);
  res.json({ success: true, ...data });
});

exports.createClient = asyncHandler(async (req, res) => {
  const client = await svc.createClient(req.user, req.body);
  res.status(201).json({ success: true, client });
});

exports.updateClient = asyncHandler(async (req, res) => {
  const client = await svc.updateClient(req.user, req.params.id, req.body);
  res.json({ success: true, client });
});

exports.getAllocation = asyncHandler(async (req, res) => {
  const data = await svc.getAllocation(req.user);
  res.json({ success: true, ...data });
});

exports.listGroups = asyncHandler(async (req, res) => {
  const data = await svc.listGroups(req.user);
  res.json({ success: true, ...data });
});

exports.createGroup = asyncHandler(async (req, res) => {
  const group = await svc.createGroup(req.user, req.body);
  res.status(201).json({ success: true, group });
});

exports.renameGroup = asyncHandler(async (req, res) => {
  const group = await svc.renameGroup(req.user, req.params.id, req.body);
  res.json({ success: true, group });
});

exports.linkGroup = asyncHandler(async (req, res) => {
  const data = await svc.linkGroup(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.consolidateGroup = asyncHandler(async (req, res) => {
  const data = await svc.consolidateGroup(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.getPayments = asyncHandler(async (req, res) => {
  const data = await svc.getPayments(req.user, req.query);
  res.json({ success: true, ...data });
});

exports.applyFeeUplift = asyncHandler(async (req, res) => {
  const data = await svc.applyFeeUplift(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.previewXero = asyncHandler(async (req, res) => {
  const data = await svc.previewXero(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.reconcileXero = asyncHandler(async (req, res) => {
  const data = await svc.reconcileXero(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.exportPayments = asyncHandler(async (req, res) => {
  const data = await svc.exportPaymentsCsv(req.user);
  res.json({ success: true, ...data });
});

exports.exportBillingGaps = asyncHandler(async (req, res) => {
  const data = await svc.exportBillingGapsCsv(req.user);
  res.json({ success: true, ...data });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const meta = await svc.updateCmSettings(req.user, req.body);
  res.json({ success: true, meta });
});

exports.getPayroll = asyncHandler(async (req, res) => {
  const data = await svc.getPayroll(req.user, req.query);
  res.json({ success: true, ...data });
});

exports.getSuper = asyncHandler(async (req, res) => {
  const data = await svc.getSuper(req.user, req.query);
  res.json({ success: true, ...data });
});

exports.updatePayrollRun = asyncHandler(async (req, res) => {
  const data = await svc.updatePayrollRun(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.getLodgement = asyncHandler(async (req, res) => {
  const data = await svc.getLodgement(req.user);
  res.json({ success: true, ...data });
});

exports.getReminders = asyncHandler(async (req, res) => {
  const data = await svc.getReminders(req.user, req.query);
  res.json({ success: true, ...data });
});

exports.exportReminders = asyncHandler(async (req, res) => {
  const data = await svc.exportReminders(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.startFY = asyncHandler(async (req, res) => {
  const meta = await svc.startFY(req.user, req.body);
  res.json({ success: true, meta });
});

exports.getPeriods = asyncHandler(async (req, res) => {
  const data = await svc.getPeriods(req.user);
  res.json({ success: true, ...data });
});

exports.updatePeriod = asyncHandler(async (req, res) => {
  const data = await svc.updateCmPeriod(req.user, req.params.periodId, req.body);
  res.json({ success: true, ...data });
});

exports.lockPeriod = asyncHandler(async (req, res) => {
  const data = await svc.lockCmPeriod(req.user, req.params.periodId, req.body);
  res.json({ success: true, ...data });
});

exports.unlockPeriod = asyncHandler(async (req, res) => {
  const data = await svc.unlockCmPeriod(req.user, req.params.periodId);
  res.json({ success: true, ...data });
});

exports.setWorkingYear = asyncHandler(async (req, res) => {
  const meta = await svc.setWorkingYear(req.user, req.body);
  res.json({ success: true, meta });
});

exports.advanceQuarter = asyncHandler(async (req, res) => {
  const meta = await svc.advanceQuarter(req.user, req.body);
  res.json({ success: true, meta });
});

exports.importClients = asyncHandler(async (req, res) => {
  const data = await svc.importClients(req.user, req.body);
  res.json({ success: true, ...data });
});

exports.exportClients = asyncHandler(async (req, res) => {
  const data = await svc.exportClients(req.user);
  res.json({ success: true, ...data });
});

exports.seed = asyncHandler(async (req, res) => {
  if (!isFullAccessRole(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  const data = await seedClientManagement({ force: !!req.body?.force });
  res.json({ success: true, ...data });
});

exports.clearSeed = asyncHandler(async (req, res) => {
  if (!isFullAccessRole(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  const data = await clearClientManagement();
  res.json({ success: true, ...data });
});

// --- Onboarding ---

exports.getOnboardingMeta = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.getMeta(req.user);
  res.json({ success: true, data });
});

exports.getOnboardingDashboard = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.getDashboard();
  res.json({ success: true, data });
});

exports.listOnboardingEntities = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.listEntities(req.query.filter || 'active');
  res.json({ success: true, data });
});

exports.getOnboardingEntity = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.getEntity(req.params.id);
  res.json({ success: true, data });
});

exports.createOnboardingEntity = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.createEntity(req.user, req.body);
  res.status(201).json({ success: true, data });
});

exports.updateOnboardingEntity = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.updateEntity(req.user, req.params.id, req.body);
  res.json({ success: true, data });
});

exports.searchOnboardingClients = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.searchClients(req.query.q);
  res.json({ success: true, data });
});

exports.getOnboardingManagerFiles = asyncHandler(async (req, res) => {
  const data = await onboardingSvc.getManagerFiles();
  res.json({ success: true, data });
});

exports.seedOnboarding = asyncHandler(async (req, res) => {
  if (!isFullAccessRole(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  const data = await onboardingSvc.seedOnboarding(req.user);
  res.json({ success: true, ...data });
});
