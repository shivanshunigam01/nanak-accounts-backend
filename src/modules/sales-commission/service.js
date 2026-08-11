const mongoose = require('mongoose');
const User = require('../../models/User');
const SalesClient = require('../../models/SalesClient');
const SalesDeal = require('../../models/SalesDeal');
const SalesPayment = require('../../models/SalesPayment');
const SalesLedgerEntry = require('../../models/SalesLedgerEntry');
const SalesPayoutBatch = require('../../models/SalesPayoutBatch');
const SalesPayoutItem = require('../../models/SalesPayoutItem');
const SalesClawbackCase = require('../../models/SalesClawbackCase');
const SalesCommissionQuery = require('../../models/SalesCommissionQuery');
const SalesCommissionPlan = require('../../models/SalesCommissionPlan');
const SalesTarget = require('../../models/SalesTarget');
const SalesSettings = require('../../models/SalesSettings');
const SalesAuditLog = require('../../models/SalesAuditLog');
const { isFullAccessRole } = require('../../config/modules');
const ENG = require('./engine');
const {
  todayISO,
  fyBounds,
  periodsForFY,
  nextPeriod,
  fyOf,
  fmtD,
  daysBetween,
  addDays,
} = require('./dates');

async function getSettings() {
  let s = await SalesSettings.findOne({ key: 'default' });
  if (!s) {
    s = await SalesSettings.create({ key: 'default' });
  }
  return s;
}

async function audit(actor, action, entity, detail) {
  const today = (await getSettings()).demoToday || todayISO();
  await SalesAuditLog.create({
    actorId: actor?._id || null,
    actorName: actor ? `${actor.name} (${actor.role})` : 'system',
    action,
    entity: entity || '',
    detail: detail || '',
    ts: today,
  });
}

async function currentRate(dateISO) {
  const d = dateISO || todayISO((await getSettings()).demoToday);
  const plan = await SalesCommissionPlan.findOne({ effectiveDate: { $lte: d } }).sort({ effectiveDate: -1 });
  return plan ? plan.rate : 0.01;
}

async function indiaStaffUsers() {
  return User.find({
    office: 'India',
    role: 'staff',
    commissionEligible: true,
    active: true,
  }).sort({ name: 1 });
}

async function visibleUserIds(actor) {
  if ((actor.role === 'admin' || actor.role === 'owner')) return null; // all
  if (actor.role === 'manager') {
    const team = await User.find({ managerId: actor._id, active: true }).select('_id');
    return [String(actor._id), ...team.map((t) => String(t._id))];
  }
  return [String(actor._id)];
}

function canSeeUser(actor, targetId, visibleIds) {
  if ((actor.role === 'admin' || actor.role === 'owner')) return true;
  if (!visibleIds) return true;
  return visibleIds.includes(String(targetId));
}

async function assertCanSeeUser(actor, targetId) {
  const visible = await visibleUserIds(actor);
  if (!canSeeUser(actor, targetId, visible)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

async function resolveScopedUserId(actor, requestedUserId) {
  if (actor.role === 'staff') return String(actor._id);
  if (!requestedUserId) return null;
  await assertCanSeeUser(actor, requestedUserId);
  return String(requestedUserId);
}

async function getMeta() {
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  const fy = settings.reportFY || fyOf(today);
  const periods = periodsForFY(fy, settings.payoutFrequency);
  const next = nextPeriod(periods, today);
  return {
    fy,
    payoutFrequency: settings.payoutFrequency,
    nextRun: next ? { id: next.id, label: next.label, cutoff: next.cutoff } : null,
    fxRate: settings.fxRate,
    today,
    retentionDays: settings.retentionDays,
    firstYearMonths: settings.firstYearMonths,
    periods,
  };
}

async function firstVerifiedPaymentAt(dealId) {
  const ps = await SalesPayment.find({
    dealId,
    status: 'cleared',
    verified: true,
    eligibleNetCents: { $gt: 0 },
  })
    .sort({ paidOn: 1 })
    .select('paidOn');
  return ps[0]?.paidOn || null;
}

async function tryActivate(deal, settings) {
  if (deal.activationDate || deal.voided || deal.cancelDate) return deal;
  const fv = await firstVerifiedPaymentAt(deal._id);
  const act = ENG.computeActivation(deal, fv);
  if (!act) return deal;
  ENG.applyActivationSnapshots(deal, act, settings);
  await deal.save();
  const credits = await SalesLedgerEntry.find({ dealId: deal._id, kind: 'credit', eligibleAt: null });
  for (const c of credits) {
    c.eligibleAt = c.ts > act ? c.ts : act;
    await c.save();
  }
  return deal;
}

async function serializeDeal(deal, extras = {}) {
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  const unverified = await SalesPayment.countDocuments({
    dealId: deal._id,
    status: 'cleared',
    verified: false,
  });
  const client = extras.client || (await SalesClient.findById(deal.clientId));
  const owner = extras.owner || (await User.findById(deal.ownerId).select('name role office'));
  const cash = await SalesPayment.aggregate([
    { $match: { dealId: deal._id, status: 'cleared', verified: true } },
    { $group: { _id: null, sum: { $sum: '$eligibleNetCents' } } },
  ]);
  const ledgerNet = await SalesLedgerEntry.aggregate([
    { $match: { dealId: deal._id, cancelled: false } },
    { $group: { _id: null, sum: { $sum: '$amountCents' } } },
  ]);
  return {
    ...deal.toObject(),
    client: client ? { _id: client._id, name: client.name, entity: client.entity } : null,
    owner: owner ? { _id: owner._id, name: owner.name } : null,
    displayStage: ENG.displayStage(deal, today),
    blocker: ENG.blocker(deal, unverified, today),
    retState: ENG.retState(deal, today),
    targetQualified: ENG.targetQualified(deal, today),
    cashCollectedCents: cash[0]?.sum || 0,
    netCommissionCents: ledgerNet[0]?.sum || 0,
  };
}

async function listDeals(actor, { page, limit, skip, staffId, q }) {
  const scoped = await resolveScopedUserId(actor, staffId);
  const visible = await visibleUserIds(actor);
  const filter = { voided: false };
  if (scoped) filter.ownerId = scoped;
  else if (visible) filter.ownerId = { $in: visible };

  if (q) {
    const clients = await SalesClient.find({ name: new RegExp(q, 'i') }).select('_id');
    filter.$or = [{ clientId: { $in: clients.map((c) => c._id) } }, { service: new RegExp(q, 'i') }];
  }

  const [total, deals] = await Promise.all([
    SalesDeal.countDocuments(filter),
    SalesDeal.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
  ]);

  const items = [];
  for (const d of deals) items.push(await serializeDeal(d));
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function bookDeal(actor, body) {
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  let ownerId = body.ownerId || actor._id;
  if (actor.role === 'staff') ownerId = actor._id;
  else await assertCanSeeUser(actor, ownerId);

  const owner = await User.findById(ownerId);
  if (!owner || !owner.commissionEligible) {
    const err = new Error('Salesperson must be India commission-eligible staff');
    err.status = 400;
    throw err;
  }

  let client = null;
  if (body.clientId) {
    client = await SalesClient.findById(body.clientId);
  } else {
    client = await SalesClient.create({
      name: body.clientName,
      entity: body.entity || '',
      contact: body.contact || '',
      phone: body.phone || '',
      email: body.email || '',
    });
  }

  const type = body.type || 'new';
  const annualFeeCents = Math.round(Number(body.annualFeeCents || body.annualFee * 100 || 0));
  const prevFeeCents = Math.round(Number(body.prevFeeCents || body.prevFee * 100 || 0));
  const eligible = ENG.eligibleNewCents(type, annualFeeCents, prevFeeCents);

  const signedAt = body.signedAt || null;
  let rateSnapshot = null;
  let stage = body.stage || 'Draft';
  if (signedAt) {
    rateSnapshot = await currentRate(signedAt);
    stage = 'Won';
  }

  const deal = await SalesDeal.create({
    clientId: client._id,
    ownerId,
    type,
    service: body.service || '',
    stage,
    annualFeeCents,
    prevFeeCents,
    eligibleNewCents: eligible,
    rateSnapshot,
    quoteDate: body.quoteDate || null,
    proposalDate: body.proposalDate || null,
    signedAt,
    billing: body.billing || 'Monthly',
    ignitionId: body.ignitionId || '',
    quotePadRef: body.quotePadRef || '',
    notes: body.notes || '',
  });

  await audit(actor, 'Deal booked', `deal ${deal._id}`, client.name);
  return serializeDeal(deal, { client, owner });
}

async function getDeal(actor, id) {
  const deal = await SalesDeal.findById(id);
  if (!deal) {
    const err = new Error('Deal not found');
    err.status = 404;
    throw err;
  }
  await assertCanSeeUser(actor, deal.ownerId);
  const payments = await SalesPayment.find({ dealId: deal._id }).sort({ paidOn: -1 });
  const ledger = await SalesLedgerEntry.find({ dealId: deal._id }).sort({ ts: -1 });
  const serialized = await serializeDeal(deal);
  return { ...serialized, payments, ledger };
}

async function markSigned(actor, dealId, signedAt) {
  const deal = await SalesDeal.findById(dealId);
  if (!deal) {
    const err = new Error('Deal not found');
    err.status = 404;
    throw err;
  }
  await assertCanSeeUser(actor, deal.ownerId);
  if (deal.voided) throw Object.assign(new Error('Deal voided'), { status: 400 });
  const date = signedAt || todayISO((await getSettings()).demoToday);
  deal.signedAt = date;
  deal.rateSnapshot = await currentRate(date);
  deal.stage = 'Won';
  deal.eligibleNewCents = ENG.eligibleNewCents(deal.type, deal.annualFeeCents, deal.prevFeeCents);
  await deal.save();
  await audit(actor, 'Deal signed', `deal ${deal._id}`, date);
  return serializeDeal(deal);
}

async function setMilestone(actor, dealId, field, date) {
  const allowed = ['paymentSetupCompletedAt', 'onboardingCompletedAt', 'proposalDate'];
  if (!allowed.includes(field)) throw Object.assign(new Error('Invalid milestone'), { status: 400 });
  const deal = await SalesDeal.findById(dealId);
  if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 });
  await assertCanSeeUser(actor, deal.ownerId);
  const settings = await getSettings();
  deal[field] = date || todayISO(settings.demoToday);
  await deal.save();
  await tryActivate(deal, settings);
  await audit(actor, `Milestone ${field}`, `deal ${deal._id}`, deal[field]);
  return serializeDeal(deal);
}

async function addPayment(actor, dealId, body) {
  const deal = await SalesDeal.findById(dealId);
  if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 });
  await assertCanSeeUser(actor, deal.ownerId);
  if (!ENG.won(deal) || deal.voided) throw Object.assign(new Error('Deal must be signed'), { status: 400 });

  const gross = Math.round(Number(body.grossCents ?? body.gross * 100));
  const gst = Math.round(Number(body.gstCents ?? (body.gst * 100 || 0)));
  const excluded = Math.round(Number(body.excludedCents ?? (body.excluded * 100 || 0)));
  if (!(gross > 0)) throw Object.assign(new Error('Gross must be > 0'), { status: 400 });
  if (gst < 0 || excluded < 0 || gst + excluded > gross) {
    throw Object.assign(new Error('Invalid GST/exclusions'), { status: 400 });
  }
  const reference = String(body.reference || '').trim();
  if (!reference) throw Object.assign(new Error('Reference required'), { status: 400 });
  const exists = await SalesPayment.findOne({ reference });
  if (exists) throw Object.assign(new Error('Duplicate payment reference'), { status: 409 });

  const paidOn = body.paidOn || todayISO((await getSettings()).demoToday);
  const payment = await SalesPayment.create({
    dealId: deal._id,
    reference,
    paidOn,
    grossCents: gross,
    gstCents: gst,
    excludedCents: excluded,
    eligibleNetCents: gross - gst - excluded,
    status: 'cleared',
    source: body.source || 'manual',
  });
  await audit(actor, 'Payment added', `payment ${payment.reference}`, ENG.money(payment.eligibleNetCents));
  return payment;
}

async function verifyPayment(actor, paymentId) {
  if (!['manager', 'admin', 'owner'].includes(actor.role)) {
    throw Object.assign(new Error('Only managers/admins can verify'), { status: 403 });
  }
  const payment = await SalesPayment.findById(paymentId);
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  const deal = await SalesDeal.findById(payment.dealId);
  if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 });
  if (String(deal.ownerId) === String(actor._id) && !isFullAccessRole(actor.role)) {
    throw Object.assign(new Error('Cannot verify your own deal'), { status: 403 });
  }
  await assertCanSeeUser(actor, deal.ownerId);

  if (payment.verified && payment.status === 'cleared') {
    const existing = await SalesLedgerEntry.findOne({ paymentId: payment._id, kind: 'credit' });
    return { payment, credit: existing, idempotent: true };
  }

  const settings = await getSettings();
  const today = todayISO(settings.demoToday);

  if (!ENG.inWindow(deal, payment.paidOn) && deal.commissionWindowEndDate) {
    payment.verified = true;
    payment.verifiedBy = actor._id;
    payment.verifiedAt = new Date();
    payment.status = 'cleared';
    await payment.save();
    await audit(actor, 'Payment verified (outside window)', payment.reference, 'No commission');
    return { payment, credit: null, outsideWindow: true };
  }

  const rate = deal.rateSnapshot ?? (await currentRate(deal.signedAt || today));
  const ratio = ENG.incRatio(deal.type, deal.annualFeeCents, deal.prevFeeCents);
  const amount = ENG.creditForPayment(payment.eligibleNetCents, ratio, rate);

  payment.verified = true;
  payment.verifiedBy = actor._id;
  payment.verifiedAt = new Date();
  payment.status = 'cleared';
  await payment.save();

  let credit = await SalesLedgerEntry.findOne({ paymentId: payment._id, kind: 'credit' });
  if (!credit && amount !== 0) {
    const eligibleAt = deal.activationDate
      ? payment.paidOn > deal.activationDate
        ? payment.paidOn
        : deal.activationDate
      : null;
    credit = await SalesLedgerEntry.create({
      dealId: deal._id,
      paymentId: payment._id,
      userId: deal.ownerId,
      kind: 'credit',
      amountCents: amount,
      rate,
      note: `Verified ${payment.reference}`,
      ts: payment.paidOn,
      eligibleAt,
    });
  }

  await tryActivate(deal, settings);
  if (credit && deal.activationDate && !credit.eligibleAt) {
    credit.eligibleAt =
      payment.paidOn > deal.activationDate ? payment.paidOn : deal.activationDate;
    await credit.save();
  }

  await audit(actor, 'Payment verified', payment.reference, ENG.money(amount));
  return { payment, credit, pendingActivation: !deal.activationDate };
}

async function rejectPayment(actor, paymentId, reason) {
  if (!['manager', 'admin', 'owner'].includes(actor.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  if (!reason) throw Object.assign(new Error('Reason required'), { status: 400 });
  const payment = await SalesPayment.findById(paymentId);
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  const deal = await SalesDeal.findById(payment.dealId);
  await assertCanSeeUser(actor, deal.ownerId);

  const credit = await SalesLedgerEntry.findOne({ paymentId: payment._id, kind: 'credit', cancelled: false });
  if (credit) {
    if (!credit.paid && (!credit.batchId || (await isBatchOpen(credit.batchId)))) {
      credit.cancelled = true;
      if (credit.batchId) {
        credit.batchId = null;
      }
      await credit.save();
    } else {
      const settings = await getSettings();
      await SalesLedgerEntry.create({
        dealId: deal._id,
        paymentId: payment._id,
        userId: deal.ownerId,
        kind: 'refund',
        amountCents: -Math.abs(credit.amountCents),
        note: `Reject reversal: ${reason}`,
        ts: todayISO(settings.demoToday),
        eligibleAt: todayISO(settings.demoToday),
      });
    }
  }

  payment.status = 'rejected';
  payment.verified = false;
  payment.rejectReason = reason;
  await payment.save();
  await audit(actor, 'Payment rejected', payment.reference, reason);
  return payment;
}

async function isBatchOpen(batchId) {
  if (!batchId) return true;
  const b = await SalesPayoutBatch.findById(batchId);
  return b && ['draft', 'review'].includes(b.state);
}

async function refundPayment(actor, paymentId, reason) {
  if (!['manager', 'admin', 'owner'].includes(actor.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  const payment = await SalesPayment.findById(paymentId);
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  const deal = await SalesDeal.findById(payment.dealId);
  await assertCanSeeUser(actor, deal.ownerId);

  const credit = await SalesLedgerEntry.findOne({ paymentId: payment._id, kind: 'credit', cancelled: false });
  if (!credit) throw Object.assign(new Error('No credit to refund'), { status: 400 });

  const existing = await SalesLedgerEntry.findOne({
    paymentId: payment._id,
    kind: 'refund',
    cancelled: false,
  });
  if (existing) return { payment, refund: existing, idempotent: true };

  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  const refund = await SalesLedgerEntry.create({
    dealId: deal._id,
    paymentId: payment._id,
    userId: deal.ownerId,
    kind: 'refund',
    amountCents: -Math.abs(credit.amountCents),
    note: reason || 'Refund reversal',
    ts: today,
    eligibleAt: today,
  });
  payment.status = 'refunded';
  await payment.save();
  await audit(actor, 'Payment refunded', payment.reference, ENG.money(refund.amountCents));
  return { payment, refund };
}

async function cancelDeal(actor, dealId, { cancelDate, reason }) {
  if (!['manager', 'admin', 'owner'].includes(actor.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  const deal = await SalesDeal.findById(dealId);
  if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 });
  if (deal.cancelDate) return serializeDeal(deal); // idempotent

  const settings = await getSettings();
  const today = cancelDate || todayISO(settings.demoToday);
  deal.cancelDate = today;
  deal.cancelReason = reason || '';
  await deal.save();

  const rs = ENG.retState(deal, today);

  // Cancel unpaid credits
  const unpaid = await SalesLedgerEntry.find({
    dealId: deal._id,
    kind: 'credit',
    cancelled: false,
    paid: false,
  });
  for (const c of unpaid) {
    if (!c.batchId || (await isBatchOpen(c.batchId))) {
      c.cancelled = true;
      c.batchId = null;
      await c.save();
    }
  }

  let clawbackCase = null;
  if (rs === 'cancelled-in') {
    const paidCredits = await SalesLedgerEntry.find({
      dealId: deal._id,
      kind: 'credit',
      cancelled: false,
      paid: true,
    });
    const paidCents = paidCredits.reduce((s, c) => s + c.amountCents, 0);
    if (paidCents > 0) {
      await SalesLedgerEntry.create({
        dealId: deal._id,
        userId: deal.ownerId,
        kind: 'clawback',
        amountCents: -paidCents,
        note: `Retention clawback (${reason || 'cancelled'})`,
        ts: today,
        eligibleAt: today,
      });
      clawbackCase = await SalesClawbackCase.create({
        dealId: deal._id,
        userId: deal.ownerId,
        activationDate: deal.activationDate,
        maturityDate: deal.retentionMaturityDate,
        cancelDate: today,
        daysRetained: deal.activationDate ? daysBetween(deal.activationDate, today) : 0,
        reason: reason || '',
        accruedCents: paidCents,
        paidCents,
        clawbackCents: paidCents,
        recoveredCents: 0,
        waivedCents: 0,
        outstandingCents: paidCents,
        status: 'Recovering',
      });
    }
  }

  await audit(actor, 'Deal cancelled', `deal ${deal._id}`, `${rs}: ${reason || ''}`);
  return { deal: await serializeDeal(deal), clawbackCase };
}

async function voidDeal(actor, dealId, reason) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const deal = await SalesDeal.findById(dealId);
  if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 });
  deal.voided = true;
  deal.voidReason = reason || '';
  await deal.save();
  await SalesLedgerEntry.updateMany(
    { dealId: deal._id, paid: false, cancelled: false },
    { $set: { cancelled: true, batchId: null } }
  );
  await audit(actor, 'Deal voided', `deal ${deal._id}`, reason || '');
  return serializeDeal(deal);
}

async function listPaymentsAwaiting(actor, { page, limit, skip }) {
  const visible = await visibleUserIds(actor);
  const dealFilter = {};
  if (visible) dealFilter.ownerId = { $in: visible };
  const deals = await SalesDeal.find(dealFilter).select('_id');
  const dealIds = deals.map((d) => d._id);
  const filter = { dealId: { $in: dealIds }, status: 'cleared', verified: false };
  const [total, payments] = await Promise.all([
    SalesPayment.countDocuments(filter),
    SalesPayment.find(filter).sort({ paidOn: -1 }).skip(skip).limit(limit),
  ]);
  const items = [];
  for (const p of payments) {
    const deal = await SalesDeal.findById(p.dealId);
    const client = await SalesClient.findById(deal.clientId);
    const owner = await User.findById(deal.ownerId).select('name');
    const rate = deal.rateSnapshot || 0.01;
    const ratio = ENG.incRatio(deal.type, deal.annualFeeCents, deal.prevFeeCents);
    const est = ENG.creditForPayment(p.eligibleNetCents, ratio, rate);
    items.push({
      ...p.toObject(),
      clientName: client?.name,
      ownerName: owner?.name,
      estimatedCommissionCents: est,
      pendingActivation: !deal.activationDate,
    });
  }
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function listRecentlyVerified(actor, { page, limit, skip }) {
  const visible = await visibleUserIds(actor);
  const dealFilter = {};
  if (visible) dealFilter.ownerId = { $in: visible };
  const deals = await SalesDeal.find(dealFilter).select('_id');
  const filter = {
    dealId: { $in: deals.map((d) => d._id) },
    verified: true,
    status: { $in: ['cleared', 'refunded'] },
  };
  const [total, payments] = await Promise.all([
    SalesPayment.countDocuments(filter),
    SalesPayment.find(filter).sort({ verifiedAt: -1 }).skip(skip).limit(limit),
  ]);
  const items = [];
  for (const p of payments) {
    const deal = await SalesDeal.findById(p.dealId);
    const client = await SalesClient.findById(deal.clientId);
    const verifier = p.verifiedBy ? await User.findById(p.verifiedBy).select('name') : null;
    items.push({
      ...p.toObject(),
      clientName: client?.name,
      verifiedByName: verifier?.name || '—',
    });
  }
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function buildLedgerRows(userId, settings) {
  const today = todayISO(settings.demoToday);
  const entries = await SalesLedgerEntry.find({ userId, cancelled: false }).sort({ ts: 1, createdAt: 1 });
  let balance = 0;
  const chrono = [];
  for (const e of entries) {
    balance += e.amountCents;
    const deal = await SalesDeal.findById(e.dealId);
    const client = deal ? await SalesClient.findById(deal.clientId) : null;
    const batch = e.batchId ? await SalesPayoutBatch.findById(e.batchId) : null;
    const status = ENG.entryStatus(e, deal, batch, today);
    chrono.push({
      ...e.toObject(),
      clientName: client?.name || '—',
      credit: e.amountCents > 0 ? e.amountCents : null,
      debit: e.amountCents < 0 ? e.amountCents : null,
      batchLabel: batch ? `${(batch.period || '').split('-').pop()} — ${batch.state}` : null,
      status,
      balanceCents: balance,
    });
  }
  return chrono.reverse(); // newest first
}

async function getLedger(actor, { staffId, page, limit, skip }) {
  const settings = await getSettings();
  let userId = await resolveScopedUserId(actor, staffId);
  if (!userId && (actor.role === 'admin' || actor.role === 'owner') && !staffId) {
    // Admin "all" — flatten recent across staff, still paginated
    const entries = await SalesLedgerEntry.find({ cancelled: false })
      .sort({ ts: -1 })
      .skip(skip)
      .limit(limit);
    const total = await SalesLedgerEntry.countDocuments({ cancelled: false });
    const items = [];
    let runningApprox = 0;
    for (const e of entries) {
      const deal = await SalesDeal.findById(e.dealId);
      const client = deal ? await SalesClient.findById(deal.clientId) : null;
      const owner = await User.findById(e.userId).select('name');
      const batch = e.batchId ? await SalesPayoutBatch.findById(e.batchId) : null;
      items.push({
        ...e.toObject(),
        clientName: client?.name || '—',
        ownerName: owner?.name,
        credit: e.amountCents > 0 ? e.amountCents : null,
        debit: e.amountCents < 0 ? e.amountCents : null,
        batchLabel: batch ? `${(batch.period || '').split('-').pop()} — ${batch.state}` : null,
        status: ENG.entryStatus(e, deal, batch, todayISO(settings.demoToday)),
        balanceCents: null,
      });
    }
    const summary = await ledgerSummary(null);
    return { items, total, page, limit, pages: Math.ceil(total / limit) || 1, summary };
  }
  if (!userId) userId = String(actor._id);
  const all = await buildLedgerRows(userId, settings);
  const total = all.length;
  const items = all.slice(skip, skip + limit);
  const summary = await ledgerSummary(userId);
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1, summary };
}

async function ledgerSummary(userId) {
  const settings = await getSettings();
  const fy = settings.reportFY;
  const { start, end } = fyBounds(fy);
  const match = { cancelled: false };
  if (userId) match.userId = userId;

  const entries = await SalesLedgerEntry.find(match);
  let netEarned = 0;
  let ready = 0;
  let paidFy = 0;
  let clawbackBal = 0;
  for (const e of entries) {
    if (e.kind === 'credit' || e.kind === 'refund' || e.kind === 'clawback' || e.kind === 'adjustment') {
      netEarned += e.amountCents;
    }
    if (e.kind === 'credit' && !e.paid && !e.batchId) {
      const deal = await SalesDeal.findById(e.dealId);
      if (deal?.activationDate) ready += e.amountCents;
    }
    if (e.paid && e.paidAt && e.paidAt >= start && e.paidAt <= end) {
      if (e.kind === 'credit') paidFy += e.amountCents;
    }
    if ((e.kind === 'clawback' || e.kind === 'refund') && !e.paid) {
      clawbackBal += Math.abs(e.amountCents);
    }
  }
  // Outstanding clawback cases preferred
  const cbFilter = { status: 'Recovering' };
  if (userId) cbFilter.userId = userId;
  const cases = await SalesClawbackCase.find(cbFilter);
  if (cases.length) {
    clawbackBal = cases.reduce((s, c) => s + c.outstandingCents, 0);
  }
  return {
    netEarnedCents: netEarned,
    readyForPayoutCents: Math.max(0, ready),
    paidThisFyCents: paidFy,
    clawbackBalanceCents: clawbackBal,
  };
}

async function getDashboard(actor, { staffId } = {}) {
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  const fy = settings.reportFY;
  const meta = await getMeta();

  if (actor.role === 'staff' || staffId) {
    const uid = await resolveScopedUserId(actor, staffId || actor._id);
    return {
      mode: 'staff',
      meta,
      ...(await staffDashboard(uid, settings, today, fy)),
    };
  }

  // Firm overview
  const staff = await indiaStaffUsers();
  const team = [];
  let tqTotal = 0;
  let cashTotal = 0;
  let netTotal = 0;
  let atRiskTotal = 0;

  for (const u of staff) {
    const row = await staffDashboard(String(u._id), settings, today, fy);
    team.push({
      userId: u._id,
      name: u.name,
      role: 'Sales',
      ...row,
    });
    tqTotal += row.targetQualifiedCents;
    cashTotal += row.cashCollectedCents;
    netTotal += row.netEarnedCents;
    atRiskTotal += row.atRiskCents;
  }

  return {
    mode: 'firm',
    meta,
    kpis: {
      targetQualifiedCents: tqTotal,
      cashCollectedCents: cashTotal,
      netEarnedCents: netTotal,
      atRiskCents: atRiskTotal,
      staffCount: staff.length,
    },
    team,
  };
}

async function staffDashboard(userId, settings, today, fy) {
  const deals = await SalesDeal.find({ ownerId: userId, voided: false });
  let grossSigned = 0;
  let targetQualifiedCents = 0;
  let cashCollectedCents = 0;
  let atRiskCents = 0;
  let protectedCents = 0;

  for (const d of deals) {
    if (ENG.won(d)) {
      grossSigned += d.annualFeeCents;
      if (ENG.targetQualified(d, today)) targetQualifiedCents += d.eligibleNewCents;
    }
    const cash = await SalesPayment.aggregate([
      { $match: { dealId: d._id, status: 'cleared', verified: true } },
      { $group: { _id: null, sum: { $sum: '$eligibleNetCents' } } },
    ]);
    cashCollectedCents += cash[0]?.sum || 0;

    const net = await SalesLedgerEntry.aggregate([
      { $match: { dealId: d._id, cancelled: false } },
      { $group: { _id: null, sum: { $sum: '$amountCents' } } },
    ]);
    const dealNet = Math.max(0, net[0]?.sum || 0);
    const rs = ENG.retState(d, today);
    if (rs === 'at-risk') atRiskCents += dealNet;
    if (rs === 'protected') protectedCents += dealNet;
  }

  const target = await currentTarget(userId, fy, today);
  const summary = await ledgerSummary(userId);
  const achieved =
    target && target.amountCents > 0
      ? Math.round((targetQualifiedCents / target.amountCents) * 10000) / 100
      : 0;

  return {
    targetCents: target?.amountCents || 0,
    targetEffective: target?.effectiveDate || null,
    grossSignedCents: grossSigned,
    targetQualifiedCents,
    achievedPct: achieved,
    cashCollectedCents,
    netEarnedCents: summary.netEarnedCents,
    atRiskCents,
    protectedCents,
    clawbackBalanceCents: summary.clawbackBalanceCents,
    readyForPayoutCents: summary.readyForPayoutCents,
    paidThisFyCents: summary.paidThisFyCents,
  };
}

async function currentTarget(userId, fy, today) {
  return SalesTarget.findOne({
    userId,
    fy,
    effectiveDate: { $lte: today },
  }).sort({ effectiveDate: -1 });
}

async function listTargets(actor, { page, limit, skip }) {
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  const fy = settings.reportFY;
  let staff;
  if (actor.role === 'staff') {
    staff = [await User.findById(actor._id)];
  } else {
    staff = await indiaStaffUsers();
  }
  const rows = [];
  for (const u of staff) {
    const dash = await staffDashboard(String(u._id), settings, today, fy);
    const history = await SalesTarget.find({ userId: u._id, fy }).sort({ effectiveDate: -1 });
    rows.push({
      userId: u._id,
      name: u.name,
      ...dash,
      history,
    });
  }
  const total = rows.length;
  return {
    fy,
    items: rows.slice(skip, skip + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

async function setTarget(actor, body) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const settings = await getSettings();
  const fy = body.fy || settings.reportFY;
  const amountCents = Math.round(Number(body.amountCents ?? body.amount * 100));
  if (!(amountCents >= 0)) throw Object.assign(new Error('Invalid amount'), { status: 400 });
  if (!body.reason) throw Object.assign(new Error('Reason required'), { status: 400 });
  if (!body.effectiveDate) throw Object.assign(new Error('Effective date required'), { status: 400 });
  await assertCanSeeUser(actor, body.userId);
  const t = await SalesTarget.create({
    userId: body.userId,
    fy,
    amountCents,
    effectiveDate: body.effectiveDate,
    reason: body.reason,
    changedBy: actor._id,
  });
  await audit(actor, 'Target changed', `user ${body.userId}`, `${ENG.money(amountCents)} — ${body.reason}`);
  return t;
}

async function listClawbacks(actor, { page, limit, skip }) {
  const visible = await visibleUserIds(actor);
  const filter = {};
  if (visible) filter.userId = { $in: visible };
  const [total, cases] = await Promise.all([
    SalesClawbackCase.countDocuments(filter),
    SalesClawbackCase.find(filter).sort({ cancelDate: -1 }).skip(skip).limit(limit),
  ]);
  const items = [];
  for (const c of cases) {
    const deal = await SalesDeal.findById(c.dealId);
    const client = deal ? await SalesClient.findById(deal.clientId) : null;
    const user = await User.findById(c.userId).select('name');
    items.push({
      ...c.toObject(),
      clientName: client?.name,
      staffName: user?.name,
    });
  }
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function waiveClawback(actor, id, { waiveCents, reason }) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  if (!reason) throw Object.assign(new Error('Reason required'), { status: 400 });
  const c = await SalesClawbackCase.findById(id);
  if (!c) throw Object.assign(new Error('Not found'), { status: 404 });
  const amount = Math.round(Number(waiveCents));
  if (amount < 0 || amount > c.outstandingCents) {
    throw Object.assign(new Error('Waiver cannot exceed outstanding'), { status: 400 });
  }
  c.waivedCents += amount;
  c.outstandingCents = Math.max(0, c.clawbackCents - c.recoveredCents - c.waivedCents);
  c.waiver = {
    original: c.clawbackCents,
    adjusted: c.clawbackCents - c.waivedCents,
    by: actor._id,
    ts: todayISO((await getSettings()).demoToday),
    reason,
  };
  if (c.outstandingCents === 0) c.status = amount === c.clawbackCents ? 'Waived' : 'Recovered';
  await c.save();

  if (amount > 0) {
    const settings = await getSettings();
    await SalesLedgerEntry.create({
      dealId: c.dealId,
      userId: c.userId,
      kind: 'adjustment',
      amountCents: amount,
      note: `Clawback waiver: ${reason}`,
      ts: todayISO(settings.demoToday),
      eligibleAt: todayISO(settings.demoToday),
    });
  }
  await audit(actor, 'Clawback waived', `clawback ${c._id}`, `${ENG.money(amount)} — ${reason}`);
  return c;
}

async function listBatches(actor) {
  if (!['manager', 'admin', 'owner'].includes(actor.role)) {
    // staff: only see paid/locked items that include them
    const items = await SalesPayoutItem.find({ userId: actor._id });
    const batchIds = [...new Set(items.map((i) => String(i.batchId)))];
    const batches = await SalesPayoutBatch.find({ _id: { $in: batchIds } }).sort({ cutoffDate: -1 });
    return { batches };
  }
  const batches = await SalesPayoutBatch.find().sort({ cutoffDate: -1 });
  return { batches };
}

async function getBatch(actor, id, { page = 1, limit = 20, skip = 0 } = {}) {
  const batch = await SalesPayoutBatch.findById(id);
  if (!batch) throw Object.assign(new Error('Not found'), { status: 404 });
  const filter = { batchId: batch._id };
  if (actor.role === 'staff') filter.userId = actor._id;
  const [total, items] = await Promise.all([
    SalesPayoutItem.countDocuments(filter),
    SalesPayoutItem.find(filter).skip(skip).limit(limit),
  ]);
  const rows = [];
  for (const it of items) {
    const u = await User.findById(it.userId).select('name');
    rows.push({ ...it.toObject(), staffName: u?.name });
  }
  const allItems = await SalesPayoutItem.find({ batchId: batch._id });
  const totalNet = allItems.reduce((s, i) => s + i.netCents, 0);
  return {
    batch,
    items: rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totalNetCents: totalNet,
  };
}

async function createBatch(actor, periodId) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  const periods = periodsForFY(settings.reportFY, settings.payoutFrequency);
  const period = periods.find((p) => p.id === periodId);
  if (!period) throw Object.assign(new Error('Unknown period'), { status: 400 });
  if (period.cutoff > today) {
    throw Object.assign(new Error('Future period — not yet available'), { status: 400 });
  }
  const existing = await SalesPayoutBatch.findOne({ period: periodId, state: { $ne: 'void' } });
  if (existing) throw Object.assign(new Error('Batch already exists for period'), { status: 409 });

  const carryMap = {};
  const staff = await indiaStaffUsers();
  for (const u of staff) {
    // opening = unrecovered clawbacks / carry
    const cases = await SalesClawbackCase.find({ userId: u._id, status: 'Recovering' });
    const owed = cases.reduce((s, c) => s + c.outstandingCents, 0);
    if (owed) carryMap[String(u._id)] = owed;
  }

  const batch = await SalesPayoutBatch.create({
    period: periodId,
    label: period.label,
    cutoffDate: period.cutoff,
    frequency: settings.payoutFrequency,
    state: 'draft',
    opening: carryMap,
    createdBy: actor._id,
  });

  // Reserve eligible ledger entries
  for (const u of staff) {
    const entries = await SalesLedgerEntry.find({
      userId: u._id,
      cancelled: false,
      paid: false,
      batchId: null,
    });
    let earn = 0;
    let claw = 0;
    for (const e of entries) {
      const deal = await SalesDeal.findById(e.dealId);
      if (!deal?.activationDate) continue;
      const eligDate = e.kind === 'credit' ? e.eligibleAt || e.ts : e.ts;
      if (!eligDate || eligDate > period.cutoff) continue;
      if (e.kind === 'credit' && e.amountCents > 0) {
        earn += e.amountCents;
        e.batchId = batch._id;
        await e.save();
      } else if (e.amountCents < 0) {
        claw += e.amountCents;
        e.batchId = batch._id;
        await e.save();
      }
    }
    const opening = carryMap[String(u._id)] || 0;
    const { pay, carry } = ENG.payoutNet(earn, claw, opening);
    if (earn || claw || opening) {
      await SalesPayoutItem.create({
        batchId: batch._id,
        userId: u._id,
        openingCents: opening,
        earnCents: earn,
        clawbackCents: claw,
        netCents: pay,
        carryCents: carry,
        inrAmount: 0,
      });
    }
  }

  await audit(actor, 'Payout batch created', `batch ${batch._id}`, period.label);
  return batch;
}

async function advanceBatch(actor, id, body = {}) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const batch = await SalesPayoutBatch.findById(id);
  if (!batch) throw Object.assign(new Error('Not found'), { status: 404 });
  if (['paid', 'locked'].includes(batch.state)) {
    throw Object.assign(new Error('Batch is immutable'), { status: 400 });
  }
  const settings = await getSettings();
  const flow = ['draft', 'review', 'approved', 'paid', 'locked'];
  const idx = flow.indexOf(batch.state);
  const next = flow[idx + 1];
  if (!next) throw Object.assign(new Error('Cannot advance'), { status: 400 });

  if (next === 'approved') {
    batch.fxRate = settings.fxRate;
    batch.approvedBy = actor._id;
    const items = await SalesPayoutItem.find({ batchId: batch._id });
    for (const it of items) {
      it.inrAmount = ENG.inrSnapshot(it.netCents, batch.fxRate);
      await it.save();
    }
  }
  if (next === 'review') batch.reviewedBy = actor._id;
  if (next === "paid") {
    if (!body.paidAt || !body.payrollRef) {
      throw Object.assign(new Error("paidAt and payrollRef required"), { status: 400 });
    }
    batch.paidAt = body.paidAt;
    batch.payrollRef = body.payrollRef;
    batch.paidBy = actor._id;
    await SalesLedgerEntry.updateMany(
      { batchId: batch._id, cancelled: false },
      { $set: { paid: true, paidAt: body.paidAt } }
    );
    const items = await SalesPayoutItem.find({ batchId: batch._id });
    for (const it of items) {
      if (it.clawbackCents < 0) {
        let remaining = Math.abs(it.clawbackCents);
        const cases = await SalesClawbackCase.find({ userId: it.userId, status: "Recovering" }).sort({
          cancelDate: 1,
        });
        for (const c of cases) {
          if (remaining <= 0) break;
          const take = Math.min(c.outstandingCents, remaining);
          c.recoveredCents += take;
          c.outstandingCents = Math.max(0, c.clawbackCents - c.recoveredCents - c.waivedCents);
          if (c.outstandingCents === 0) c.status = "Recovered";
          await c.save();
          remaining -= take;
        }
      }
    }
    batch.state = "locked";
  } else {
    batch.state = next;
  }
  await batch.save();
  await audit(actor, `Payout batch → ${batch.state}`, `batch ${batch._id}`, batch.label);
  return batch;
}

async function exportBatchCsv(actor, id) {
  const { batch, items } = await getBatch(actor, id, { page: 1, limit: 1000, skip: 0 });
  const lines = ['Staff,Opening,New Commission,Clawbacks,Net Payout,Carry,INR'];
  for (const it of items) {
    lines.push(
      [
        `"${it.staffName || ''}"`,
        (it.openingCents / 100).toFixed(2),
        (it.earnCents / 100).toFixed(2),
        (it.clawbackCents / 100).toFixed(2),
        (it.netCents / 100).toFixed(2),
        (it.carryCents / 100).toFixed(2),
        it.inrAmount,
      ].join(',')
    );
  }
  return { filename: `${batch.period}.csv`, csv: lines.join('\n') };
}

async function listQueries(actor, { page, limit, skip, status }) {
  const visible = await visibleUserIds(actor);
  const filter = {};
  if (visible) filter.userId = { $in: visible };
  if (status) filter.status = status;
  const [total, queries] = await Promise.all([
    SalesCommissionQuery.countDocuments(filter),
    SalesCommissionQuery.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
  ]);
  const items = [];
  for (const q of queries) {
    const user = await User.findById(q.userId).select('name');
    items.push({ ...q.toObject(), staffName: user?.name });
  }
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function raiseQuery(actor, body) {
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  let deal = null;
  let clientName = body.clientName || '';
  if (body.dealId) {
    deal = await SalesDeal.findById(body.dealId);
    if (!deal) throw Object.assign(new Error('Deal not found'), { status: 404 });
    await assertCanSeeUser(actor, deal.ownerId);
    const client = await SalesClient.findById(deal.clientId);
    clientName = client?.name || clientName;
  }
  const q = await SalesCommissionQuery.create({
    userId: actor.role === 'staff' ? actor._id : body.userId || actor._id,
    dealId: deal?._id || null,
    clientName,
    status: 'Open',
    messages: [
      {
        authorId: actor._id,
        authorName: actor.name,
        body: body.body,
        at: today,
      },
    ],
    unreadForAdmin: true,
    unreadForStaff: false,
  });
  await audit(actor, 'Query raised', `query ${q._id}`, clientName);
  return q;
}

async function replyQuery(actor, id, body) {
  const q = await SalesCommissionQuery.findById(id);
  if (!q) throw Object.assign(new Error('Not found'), { status: 404 });
  await assertCanSeeUser(actor, q.userId);
  const settings = await getSettings();
  const today = todayISO(settings.demoToday);
  q.messages.push({
    authorId: actor._id,
    authorName: actor.name,
    body: body.body,
    at: today,
  });
  if (['manager', 'admin', 'owner'].includes(actor.role)) {
    q.status = 'Admin responded';
    q.unreadForStaff = true;
    q.unreadForAdmin = false;
  } else {
    q.status = q.status === 'Resolved' ? 'Reopened' : 'Open';
    q.unreadForAdmin = true;
    q.unreadForStaff = false;
  }
  await q.save();
  return q;
}

async function resolveQuery(actor, id) {
  if (!['manager', 'admin', 'owner'].includes(actor.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  const q = await SalesCommissionQuery.findById(id);
  if (!q) throw Object.assign(new Error('Not found'), { status: 404 });
  q.status = 'Resolved';
  q.unreadForAdmin = false;
  await q.save();
  await audit(actor, 'Query resolved', `query ${q._id}`, '');
  return q;
}

async function getBadges(actor) {
  const visible = await visibleUserIds(actor);
  const dealFilter = {};
  if (visible) dealFilter.ownerId = { $in: visible };
  const deals = await SalesDeal.find(dealFilter).select('_id');
  const pendingVerify =
    ['manager', 'admin', 'owner'].includes(actor.role)
      ? await SalesPayment.countDocuments({
          dealId: { $in: deals.map((d) => d._id) },
          status: 'cleared',
          verified: false,
        })
      : 0;
  const qFilter = { status: { $in: ['Open', 'Reopened', 'Admin responded'] } };
  if (visible) qFilter.userId = { $in: visible };
  if (actor.role === 'staff') qFilter.unreadForStaff = true;
  else qFilter.unreadForAdmin = true;
  const openQueries = await SalesCommissionQuery.countDocuments(
    actor.role === 'staff'
      ? { userId: actor._id, status: { $in: ['Open', 'Admin responded', 'Reopened'] } }
      : { status: { $in: ['Open', 'Reopened'] } }
  );
  return { pendingVerify, openQueries };
}

async function getSettingsDto(actor) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const settings = await getSettings();
  const plans = await SalesCommissionPlan.find().sort({ effectiveDate: -1 });
  const users = await User.find({
    $or: [{ commissionEligible: true }, { role: 'admin' }, { role: 'owner' }, { role: 'manager' }],
  }).select('name email role office commissionEligible');
  return { settings, plans, users };
}

async function updateSettings(actor, body) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const settings = await getSettings();
  const fields = [
    'retentionDays',
    'firstYearMonths',
    'payoutFrequency',
    'fxRate',
    'reportFY',
    'demoToday',
    'exclusions',
  ];
  for (const f of fields) {
    if (body[f] !== undefined) settings[f] = body[f];
  }
  await settings.save();
  await audit(actor, 'Settings updated', 'settings', JSON.stringify(body));
  return settings;
}

async function addRate(actor, body) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  if (!body.reason || !body.effectiveDate || body.rate == null) {
    throw Object.assign(new Error('rate, effectiveDate and reason required'), { status: 400 });
  }
  const rate = Number(body.rate);
  if (rate < 0 || rate > 0.05) throw Object.assign(new Error('Rate must be 0–5%'), { status: 400 });
  const plan = await SalesCommissionPlan.create({
    rate,
    effectiveDate: body.effectiveDate,
    reason: body.reason,
    createdBy: actor._id,
  });
  await audit(actor, 'Rate change', 'policy', `${(rate * 100).toFixed(2)}% from ${body.effectiveDate}`);
  return plan;
}

async function listAudit(actor, { page, limit, skip }) {
  if (!isFullAccessRole(actor.role)) throw Object.assign(new Error('Admin only'), { status: 403 });
  const [total, items] = await Promise.all([
    SalesAuditLog.countDocuments(),
    SalesAuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function listStaffOptions(actor) {
  if (actor.role === 'staff') return { staff: [] };
  const visible = await visibleUserIds(actor);
  const filter = { commissionEligible: true, active: true };
  if (visible) filter._id = { $in: visible };
  const staff = await User.find(filter).select('name role office').sort({ name: 1 });
  return { staff };
}

async function preview(body) {
  const rate = body.rate != null ? Number(body.rate) : await currentRate(body.signedAt);
  return ENG.previewCommission({
    type: body.type || 'new',
    annualFeeCents: Math.round(Number(body.annualFeeCents ?? (body.annualFee * 100 || 0))),
    prevFeeCents: Math.round(Number(body.prevFeeCents ?? (body.prevFee * 100 || 0))),
    rate,
  });
}

module.exports = {
  getSettings,
  getMeta,
  getDashboard,
  listDeals,
  bookDeal,
  getDeal,
  markSigned,
  setMilestone,
  addPayment,
  verifyPayment,
  rejectPayment,
  refundPayment,
  cancelDeal,
  voidDeal,
  listPaymentsAwaiting,
  listRecentlyVerified,
  getLedger,
  listTargets,
  setTarget,
  listClawbacks,
  waiveClawback,
  listBatches,
  getBatch,
  createBatch,
  advanceBatch,
  exportBatchCsv,
  listQueries,
  raiseQuery,
  replyQuery,
  resolveQuery,
  getBadges,
  getSettingsDto,
  updateSettings,
  addRate,
  listAudit,
  listStaffOptions,
  preview,
  audit,
  currentRate,
  tryActivate,
  ENG,
  todayISO,
  periodsForFY,
};
