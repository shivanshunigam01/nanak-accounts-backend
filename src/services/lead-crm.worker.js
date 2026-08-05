/**
 * Lead CRM background worker — SLA escalate, nurture, win-back.
 * Runs every 5 minutes when started from server bootstrap.
 */

const Lead = require("../models/Lead");
const LeadCrmSettings = require("../models/LeadCrmSettings");
const leadCrm = require("./lead-crm.service");
const leadMailer = require("./lead-mailer");

const INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
let running = false;

async function processSlaEscalations(settings) {
  if (!leadCrm.autoOn(settings, "a3")) return;
  const sla = settings.sla || { hot: 30, warm: 240, cool: 1440 };
  const open = await Lead.find({
    status: { $in: ["new", "contacted"] },
    contactedAt: null,
    escalated: { $ne: true },
  }).limit(200);

  for (const lead of open) {
    const b = leadCrm.band(lead);
    const mins = sla[b] || 1440;
    const deadline = new Date(lead.createdAt.getTime() + mins * 60000);
    if (Date.now() > deadline.getTime() && b === "hot") {
      lead.escalated = true;
      lead.log.push({
        t: "SLA breached — escalated hot lead",
        at: new Date(),
      });
      await lead.save();
      await leadCrm.bumpAuto(settings, "a3");
      await leadCrm.logActivity(
        "warn",
        `Hot lead <b>${lead.name || lead.email}</b> breached 30m SLA`,
        lead._id
      );
    }
  }
}

async function processNurture(settings) {
  if (!leadCrm.autoOn(settings, "a4")) return;
  const due = await Lead.find({
    status: { $in: ["new"] },
    contactedAt: null,
    unsubscribed: { $ne: true },
    nurtureNextAt: { $lte: new Date() },
    nurtureStep: { $lt: 3 },
    "consent.email": true,
  }).limit(50);

  for (const lead of due) {
    const nextStep = (lead.nurtureStep || 0) + 1;
    try {
      await leadMailer.sendNurture(lead, nextStep);
      lead.nurtureStep = nextStep;
      lead.log.push({ t: `Nurture email ${nextStep} sent`, at: new Date() });
      if (nextStep >= 3) {
        lead.nurtureNextAt = null;
      } else {
        const delays = { 1: 3 * 24 * 60 * 60 * 1000, 2: 6 * 24 * 60 * 60 * 1000 };
        lead.nurtureNextAt = new Date(Date.now() + (delays[nextStep] || 6 * 86400000));
      }
      await lead.save();
      await leadCrm.bumpAuto(settings, "a4");
      await leadCrm.logActivity(
        "auto",
        `Nurture ${nextStep} emailed to <b>${lead.name || lead.email}</b>`,
        lead._id
      );
    } catch (e) {
      console.error("[lead-worker] nurture failed:", e.message);
    }
  }
}

async function processWinback(settings) {
  if (!leadCrm.autoOn(settings, "a5")) return;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const lost = await Lead.find({
    status: "lost",
    unsubscribed: { $ne: true },
    winbackSentAt: null,
    updatedAt: { $lte: cutoff },
    "consent.email": true,
  }).limit(30);

  for (const lead of lost) {
    try {
      await leadMailer.sendWinback(lead);
      lead.winbackSentAt = new Date();
      lead.log.push({ t: "Win-back email sent", at: new Date() });
      await lead.save();
      await leadCrm.bumpAuto(settings, "a5");
      await leadCrm.logActivity(
        "auto",
        `Win-back emailed to <b>${lead.name || lead.email}</b>`,
        lead._id
      );
    } catch (e) {
      console.error("[lead-worker] winback failed:", e.message);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const settings = await LeadCrmSettings.getOrCreate();
    await processSlaEscalations(settings);
    await processNurture(settings);
    await processWinback(settings);
  } catch (e) {
    console.error("[lead-worker] tick error:", e.message);
  } finally {
    running = false;
  }
}

function startLeadCrmWorker() {
  if (timer) return;
  console.log("[lead-worker] started (every 5 min)");
  // First run after 30s so boot isn't blocked
  setTimeout(() => tick(), 30000);
  timer = setInterval(tick, INTERVAL_MS);
}

function stopLeadCrmWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startLeadCrmWorker, stopLeadCrmWorker, tick };
