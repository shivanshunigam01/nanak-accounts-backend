/**
 * Lead CRM capture, scoring, routing, and automation hooks.
 */

const Lead = require("../models/Lead");
const LeadCrmSettings = require("../models/LeadCrmSettings");
const LeadActivity = require("../models/LeadActivity");
const User = require("../models/User");
const leadMailer = require("./lead-mailer");

const SRC_LABEL = {
  blog: "Blog",
  blog_card: "Blog card",
  popup: "Popup",
  newsletter: "Newsletter",
  tax_check: "Tax check",
  income_tax_calculator: "Income tax calculator",
  pay_calculator: "Pay calculator",
  contact_us: "Contact us",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  phone: "Phone call",
  walk_in: "Walk-in",
  referral: "Referral",
};

const SVC_LABEL = leadMailer.SVC_LABEL;

function band(lead, sla) {
  const s = lead.score || 0;
  if (s >= 80 || lead.callbackRequested) return "hot";
  if (s >= 60) return "warm";
  return "cool";
}

function scoreFor(src, svc, cb) {
  const base = {
    business_advisory: 75,
    smsf: 70,
    property_tax: 68,
    business_tax: 65,
    individual_tax: 52,
  }[svc] || 52;
  let s = base;
  if (cb) s += 15;
  if (src === "referral") s += 15;
  if (src === "walk_in" || src === "phone") s += 10;
  if (src === "newsletter") s -= 30;
  if (src === "blog" || src === "blog_card") s += 10;
  if (src === "contact_us") s += 12;
  if (src === "income_tax_calculator" || src === "pay_calculator") s += 8;
  return Math.max(15, Math.min(100, s));
}

/** Map legacy touchpoint / payload → CRM source key */
function mapSource({ source, channel, explicit }) {
  if (explicit && SRC_LABEL[explicit]) return explicit;
  const src = String(source || "").toLowerCase();
  const ch = String(channel || "").toLowerCase();
  if (src === "newsletter_signup" || src === "newsletter") return "newsletter";
  if (src === "income_tax_calculator" || src === "income-tax-calculator") return "income_tax_calculator";
  if (src === "pay_calculator" || src === "pay-calculator") return "pay_calculator";
  if (src === "contact_us" || src === "contact-us" || src === "contactus" || ch === "contact_us") return "contact_us";
  if (src === "blog" || src === "blog_sidebar" || ch === "blog_sidebar") return "blog";
  if (ch === "blog" || src === "blog_card") return "blog_card";
  if (ch === "website_popup" || (src === "free_15min_call" && ch !== "blog")) return "popup";
  if (src === "free_15min_call" && ch === "blog") return "blog_card";
  if (src.startsWith("tax_check")) return "tax_check";
  if (SRC_LABEL[src]) return src;
  return "popup";
}

async function logActivity(kind, text, leadId = null) {
  try {
    await LeadActivity.create({ kind, text, leadId, at: new Date() });
    // Cap feed size
    const count = await LeadActivity.countDocuments();
    if (count > 200) {
      const old = await LeadActivity.find().sort({ at: 1 }).limit(count - 200).select("_id");
      if (old.length) {
        await LeadActivity.deleteMany({ _id: { $in: old.map((o) => o._id) } });
      }
    }
  } catch (e) {
    console.error("[lead-crm] logActivity:", e.message);
  }
}

async function bumpAuto(settings, id) {
  const a = (settings.automations || []).find((x) => x.id === id);
  if (a) {
    a.ran = (a.ran || 0) + 1;
    settings.markModified("automations");
    await settings.save();
  }
}

function autoOn(settings, id) {
  const a = (settings.automations || []).find((x) => x.id === id);
  return a ? !!a.on : false;
}

async function findExistingClient(email) {
  try {
    const PracticeClient = require("../models/PracticeClient");
    const c = await PracticeClient.findOne({
      email: String(email).toLowerCase(),
    })
      .select("_id email managerId")
      .lean();
    return c || null;
  } catch {
    return null;
  }
}

async function activeLoad(userId) {
  return Lead.countDocuments({
    owner: userId,
    status: { $nin: ["won", "lost"] },
  });
}

async function routeLead(lead, settings) {
  const existing = await findExistingClient(lead.email);
  if (existing && autoOn(settings, "a6")) {
    lead.existingClient = true;
    if (existing.managerId) {
      lead.owner = existing.managerId;
      lead.routeWhy = "existing client - to partner";
    } else {
      const partner = await User.findOne({
        role: { $in: ["admin", "owner"] },
        active: true,
      })
        .sort({ role: 1 })
        .select("_id name");
      if (partner) {
        lead.owner = partner._id;
        lead.routeWhy = "existing client - to partner";
      }
    }
    await bumpAuto(settings, "a6");
    return;
  }

  const svc = lead.serviceInterest || "individual_tax";
  const routingMap = settings.routing instanceof Map
    ? Object.fromEntries(settings.routing)
    : settings.routing?.toObject?.() || settings.routing || {};
  const fixed = routingMap[svc];

  if (fixed && fixed !== "auto") {
    lead.owner = fixed;
    lead.routeWhy = `rule: ${SVC_LABEL[svc] || svc} always to assigned owner`;
    return;
  }

  let agents = (settings.agents || []).slice();
  if (!agents.length) {
    const users = await User.find({
      active: { $ne: false },
      role: { $in: ["admin", "owner", "manager", "staff"] },
    })
      .select("_id name office")
      .lean();
    agents = users.map((u) => ({
      userId: u._id,
      officeCity: u.office === "India" ? "Chandigarh" : "Melbourne",
      skills: ["individual_tax", "business_tax", "business_advisory", "property_tax", "smsf"],
      capacity: 10,
    }));
  }

  let pool = agents.filter(
    (t) =>
      (t.skills || []).includes(svc) &&
      (!lead.city || t.officeCity === lead.city)
  );
  let why = "skill + same office";
  if (!pool.length) {
    pool = agents.filter((t) => (t.skills || []).includes(svc));
    why = "skill match";
  }
  if (!pool.length) {
    pool = agents.slice();
    why = "fallback";
  }

  const loads = await Promise.all(
    pool.map(async (t) => ({ t, load: await activeLoad(t.userId) }))
  );
  const free = loads.filter(({ t, load }) => load < (t.capacity || 8));
  const use = (free.length ? free : loads).sort(
    (a, b) => a.load / (a.t.capacity || 8) - b.load / (b.t.capacity || 8)
  );
  if (use[0]) {
    lead.owner = use[0].t.userId;
    lead.routeWhy = `${why}, lightest load`;
  }
}

/**
 * Canonical capture — used by public /api/leads and legacy endpoints.
 * @returns {{ lead, created, updated }}
 */
async function capture(raw = {}) {
  const leadIn = raw.lead || raw;
  const touchpoint = raw.touchpoint || {};
  const email = String(leadIn.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    const err = new Error("A valid email is required");
    err.status = 400;
    throw err;
  }

  const settings = await LeadCrmSettings.getOrCreate();
  const mobile =
    leadIn.mobile != null && String(leadIn.mobile).trim()
      ? String(leadIn.mobile).trim()
      : leadIn.phone != null && String(leadIn.phone).trim()
        ? String(leadIn.phone).trim()
        : null;

  const callbackRequested = Boolean(
    leadIn.callback_requested ?? leadIn.callbackRequested
  );
  const serviceInterest = String(
    leadIn.service_interest || leadIn.serviceInterest || "individual_tax"
  ).trim() || "individual_tax";

  const source = mapSource({
    source: touchpoint.source || leadIn.source,
    channel: touchpoint.channel || leadIn.channel,
    explicit: leadIn.source || raw.source,
  });

  const name = String(leadIn.name || "").trim();
  const quizAnswers = leadIn.quiz_answers || leadIn.quizAnswers || {};
  const calculatorSnapshot =
    leadIn.calculator_snapshot || leadIn.calculatorSnapshot || raw.calculatorSnapshot || null;
  const message = String(leadIn.message || leadIn.admin_notes || leadIn.adminNotes || "").trim();
  const articleTitle =
    touchpoint.article_title ||
    touchpoint.articleTitle ||
    leadIn.articleTitle ||
    null;
  const page = touchpoint.page || leadIn.page || "/";
  const channel = touchpoint.channel || leadIn.channel || "website";
  const city = String(leadIn.city || "").trim();

  const consentIn = leadIn.consent || {};
  const consent = {
    email:
      consentIn.email === false || consentIn.email_marketing === false
        ? false
        : true,
    sms: Boolean(consentIn.sms || consentIn.mobile || mobile),
    whatsapp: Boolean(consentIn.whatsapp),
  };
  if (source === "newsletter") {
    consent.email = true;
    consent.sms = false;
    consent.whatsapp = false;
  }

  // Callback update on open lead
  if (callbackRequested || (mobile && String(touchpoint.source || "").includes("callback"))) {
    const existing = await Lead.findOne({
      email,
      status: { $in: ["new", "contacted"] },
    }).sort({ createdAt: -1 });
    if (existing) {
      if (mobile) existing.mobile = mobile;
      existing.callbackRequested = true;
      if (!existing.score || existing.score < 80) {
        existing.score = Math.min(100, (existing.score || 50) + 15);
      }
      existing.log.push({ t: "Callback / mobile captured", at: new Date() });
      await existing.save();
      return { lead: existing, created: false, updated: true };
    }
  }

  // Same-day open lead merge
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let doc = await Lead.findOne({
    email,
    createdAt: { $gte: dayAgo },
    status: { $in: ["new", "contacted"] },
  }).sort({ createdAt: -1 });

  const score =
    Number(leadIn.lead_score ?? leadIn.leadScore ?? leadIn.score) ||
    scoreFor(source, serviceInterest, callbackRequested);

  if (doc) {
    if (name) doc.name = name;
    doc.serviceInterest = serviceInterest || doc.serviceInterest;
    doc.score = score || doc.score;
    if (Object.keys(quizAnswers).length) doc.quizAnswers = quizAnswers;
    if (calculatorSnapshot) doc.calculatorSnapshot = calculatorSnapshot;
    if (mobile) doc.mobile = mobile;
    if (callbackRequested) doc.callbackRequested = true;
    if (articleTitle) doc.articleTitle = articleTitle;
    if (message) {
      doc.adminNotes = doc.adminNotes
        ? `${doc.adminNotes}\n\n${message}`
        : message;
      doc.log.push({ t: `Message: ${message.slice(0, 200)}`, at: new Date() });
    }
    doc.page = page;
    doc.channel = channel;
    await doc.save();
    return { lead: doc, created: false, updated: true };
  }

  doc = new Lead({
    name,
    email,
    mobile,
    status: "new",
    score,
    callbackRequested,
    serviceInterest,
    source,
    channel,
    page,
    articleTitle,
    city,
    marketingOptin: leadIn.marketing_optin !== false && leadIn.marketingOptin !== false,
    consent,
    quizAnswers,
    calculatorSnapshot,
    adminNotes: message || "",
    log: [
      { t: `Captured from ${SRC_LABEL[source] || source}`, at: new Date() },
      ...(message ? [{ t: `Message: ${message.slice(0, 200)}`, at: new Date() }] : []),
    ],
    legacyRef: raw.legacyRef || undefined,
  });

  // New leads stay unassigned — admin/owner assigns manually in Lead CRM.
  // (Auto-routing to staff is intentionally disabled.)
  doc.owner = null;
  doc.routeWhy = "awaiting admin assignment";
  doc.log.push({
    t: "Left unassigned — admin will assign",
    at: new Date(),
  });
  await logActivity(
    "route",
    `<b>${name || email}</b> from ${SRC_LABEL[source]} → <b>unassigned</b> (awaiting admin assignment)`,
    null
  );

  // Nurture schedule: first follow-up at +24h if a4 on and not newsletter-only cool path
  if (autoOn(settings, "a4") && source !== "newsletter") {
    doc.nurtureStep = 0;
    doc.nurtureNextAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  await doc.save();
  // set leadId on last activity if needed
  await LeadActivity.updateMany(
    { leadId: null, text: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) },
    { $set: { leadId: doc._id } }
  ).catch(() => {});

  // Case study email (a1) — skip newsletter
  if (autoOn(settings, "a1") && source !== "newsletter" && consent.email) {
    try {
      await leadMailer.sendCaseStudy(doc);
      doc.caseStudySentAt = new Date();
      doc.log.push({ t: "Case study emailed automatically", at: new Date() });
      await doc.save();
      await bumpAuto(settings, "a1");
      await logActivity(
        "auto",
        `Case study emailed to <b>${name || email}</b> automatically`,
        doc._id
      );
    } catch (e) {
      console.error("[lead-crm] case study send failed:", e.message);
      doc.log.push({ t: `Case study email failed: ${e.message}`, at: new Date() });
      await doc.save();
    }
  }

  if (doc.existingClient) {
    await logActivity(
      "warn",
      `<b>${name || email}</b> matches an existing client - no cold pitch`,
      doc._id
    );
  }

  return { lead: doc, created: true, updated: false };
}

async function markContacted(leadId, userId) {
  const lead = await Lead.findById(leadId);
  if (!lead) return null;
  if (!lead.contactedAt) {
    lead.contactedAt = new Date();
    lead.status = "contacted";
    lead.nurtureNextAt = null;
    lead.log.push({
      t: "First contact logged",
      at: new Date(),
      by: userId || null,
    });
    await lead.save();
    const mins = Math.round((lead.contactedAt - lead.createdAt) / 60000);
    await logActivity(
      "win",
      `First contact on <b>${lead.name || lead.email}</b> in ${mins}m`,
      lead._id
    );
  }
  return lead;
}

module.exports = {
  capture,
  routeLead,
  scoreFor,
  mapSource,
  band,
  logActivity,
  bumpAuto,
  autoOn,
  markContacted,
  SRC_LABEL,
  SVC_LABEL,
};
