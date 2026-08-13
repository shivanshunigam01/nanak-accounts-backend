/**
 * Public + Admin Lead CRM controllers
 */

const Lead = require("../models/Lead");
const LeadCrmSettings = require("../models/LeadCrmSettings");
const LeadActivity = require("../models/LeadActivity");
const User = require("../models/User");
const leadCrm = require("../services/lead-crm.service");
const leadMailer = require("../services/lead-mailer");
const { isFullAccessRole, defaultLeadScope } = require("../config/modules");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Staff with leadScope=own only see leads they own. Admin/Owner always see all. */
function leadScopeIsOwn(user) {
  if (!user) return true;
  if (isFullAccessRole(user.role)) return false;
  const scope = user.leadScope || defaultLeadScope(user.role);
  return scope === "own";
}

function sameId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Resolve owner id whether `owner` is ObjectId, string, or populated user. */
function leadOwnerId(lead) {
  if (!lead || lead.owner == null) return null;
  if (typeof lead.owner === "object") {
    return lead.owner._id || lead.owner.id || null;
  }
  return lead.owner;
}

function assertLeadOwned(req, lead) {
  if (!leadScopeIsOwn(req.user)) return null;
  const ownerId = leadOwnerId(lead);
  if (!ownerId || !sameId(ownerId, req.user._id)) {
    return {
      status: 403,
      body: { success: false, message: "You do not have access to this lead" },
    };
  }
  return null;
}

// ── Public capture ──

exports.createPublic = async (req, res) => {
  try {
    // Honeypot
    if (req.body?.lead?.company_website || req.body?.company_website) {
      return res.status(200).json({ success: true, data: { ok: true } });
    }
    const result = await leadCrm.capture(req.body);
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: result.lead,
      created: result.created,
      updated: result.updated,
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("[leads] createPublic:", err);
    return res.status(status).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

// ── Admin list ──

exports.list = async (req, res) => {
  try {
    const {
      tab = "everything",
      status,
      source,
      service,
      owner,
      callback,
      search,
      page = 1,
      limit = 25,
      mine,
    } = req.query;

    const filter = {};
    const ownOnly = leadScopeIsOwn(req.user);

    if (ownOnly) {
      // Scoped staff: always limited to their own leads (ignore pool tabs).
      filter.owner = req.user._id;
      if (tab === "won") filter.status = "won";
      else if (tab === "lost") filter.status = "lost";
      else if (tab !== "everything") filter.status = { $nin: ["won", "lost"] };
    } else if (tab === "unassigned") {
      filter.contactedAt = null;
      filter.status = { $nin: ["won", "lost"] };
    } else if (tab === "mine" || mine === "1") {
      filter.owner = req.user._id;
      filter.status = { $nin: ["won", "lost"] };
    } else if (tab === "all") {
      filter.status = { $nin: ["won", "lost"] };
    } else if (tab === "won") {
      filter.status = "won";
    } else if (tab === "lost") {
      filter.status = "lost";
    }
    // tab === "everything" → no status filter; show every lead

    if (status && status !== "all") filter.status = status;
    if (source) filter.source = source;
    if (service) filter.serviceInterest = service;
    if (owner && !ownOnly) filter.owner = owner;
    if (callback === "1" || callback === "true") filter.callbackRequested = true;
    if (search) {
      const q = String(search).trim();
      filter.$or = [
        { email: new RegExp(q, "i") },
        { name: new RegExp(q, "i") },
        { mobile: new RegExp(q, "i") },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * lim;

    const [total, data] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .populate("owner", "name email role")
        .lean(),
    ]);

    return res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: lim,
        total,
        pages: Math.ceil(total / lim) || 1,
      },
    });
  } catch (err) {
    console.error("[leads] list:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    // Ownership check uses the raw owner ObjectId so a failed populate
    // (deleted user) cannot lock an assigned staff member out of their lead.
    if (leadScopeIsOwn(req.user)) {
      const raw = await Lead.findById(req.params.id).select("owner").lean();
      if (!raw) {
        return res.status(404).json({ success: false, message: "Lead not found" });
      }
      const denied = assertLeadOwned(req, raw);
      if (denied) return res.status(denied.status).json(denied.body);
    }

    const lead = await Lead.findById(req.params.id)
      .populate("owner", "name email role")
      .lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    return res.json({ success: true, data: lead });
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createManual = async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email required" });
    }
    const intake = String(body.intakeType || body.intake_type || "").trim();
    const intakeLabel = intake && leadCrm.SRC_LABEL?.[intake] ? leadCrm.SRC_LABEL[intake] : intake;
    const result = await leadCrm.capture({
      lead: {
        name: body.name,
        email,
        mobile: body.mobile,
        service_interest: body.serviceInterest || body.service_interest,
        source: "manual",
        city: body.city,
        callback_requested: body.callbackRequested,
        admin_notes: intakeLabel ? `Intake: ${intakeLabel}` : "",
        consent: body.consent || { email: true, sms: !!body.mobile, whatsapp: false },
      },
      touchpoint: {
        channel: "manual",
        source: "manual",
        page: "/admin/lead-crm",
      },
    });
    return res.status(201).json({ success: true, data: result.lead });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    const denied = assertLeadOwned(req, lead);
    if (denied) return res.status(denied.status).json(denied.body);

    const {
      status,
      adminNotes,
      notes,
      owner,
      name,
      mobile,
      serviceInterest,
      city,
      markContacted,
      addNote,
    } = req.body || {};

    // Scoped staff cannot reassign leads away from themselves.
    if (leadScopeIsOwn(req.user) && owner !== undefined) {
      return res.status(403).json({
        success: false,
        message: "You cannot reassign leads with your current lead scope",
      });
    }

    if (status && ["new", "contacted", "won", "lost"].includes(status)) {
      lead.status = status;
      if (status === "contacted" && !lead.contactedAt) {
        lead.contactedAt = new Date();
        lead.nurtureNextAt = null;
      }
      if (status === "won" || status === "lost") {
        lead.contactedAt = lead.contactedAt || new Date();
        lead.nurtureNextAt = null;
        lead.log.push({
          t: status === "won" ? "Converted to client" : "Marked lost",
          at: new Date(),
          by: req.user._id,
        });
        await leadCrm.logActivity(
          "win",
          `<b>${lead.name || lead.email}</b> marked ${status}`,
          lead._id
        );
      }
    }
    if (adminNotes !== undefined || notes !== undefined) {
      lead.adminNotes = adminNotes !== undefined ? adminNotes : notes;
    }
    if (owner !== undefined) {
      if (owner) {
        const assignee = await User.findOne({ _id: owner, active: true }).select("_id").lean();
        if (!assignee) {
          return res.status(400).json({
            success: false,
            message: "Assignee not found or inactive",
          });
        }
        lead.owner = assignee._id;
        lead.routeWhy = "manual reassignment";
      } else {
        lead.owner = null;
      }
      lead.log.push({ t: "Owner updated", at: new Date(), by: req.user._id });
    }
    if (name !== undefined) lead.name = name;
    if (mobile !== undefined) lead.mobile = mobile;
    if (serviceInterest !== undefined) lead.serviceInterest = serviceInterest;
    if (city !== undefined) lead.city = city;
    if (markContacted) {
      await leadCrm.markContacted(lead._id, req.user._id);
      return res.json({
        success: true,
        data: await Lead.findById(lead._id).populate("owner", "name email role"),
      });
    }
    if (addNote) {
      lead.log.push({ t: String(addNote), at: new Date(), by: req.user._id });
    }

    await lead.save();
    const populated = await Lead.findById(lead._id).populate("owner", "name email role");
    return res.json({ success: true, data: populated });
  } catch (err) {
    console.error("[leads] update:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.stats = async (req, res) => {
  try {
    const openFilter = { status: { $nin: ["won", "lost"] } };
    if (leadScopeIsOwn(req.user)) openFilter.owner = req.user._id;
    const open = await Lead.find(openFilter)
      .populate("owner", "name")
      .lean();
    const settings = await LeadCrmSettings.getOrCreate();
    const sla = settings.sla || { hot: 30, warm: 240, cool: 1440 };

    const now = Date.now();
    let breached = 0;
    const unc = open.filter((l) => !l.contactedAt);
    for (const l of unc) {
      const b = leadCrm.band(l);
      const target = (sla[b] || 1440) * 60000;
      if (now > new Date(l.createdAt).getTime() + target) breached++;
    }

    const doneFilter = { contactedAt: { $ne: null } };
    if (leadScopeIsOwn(req.user)) doneFilter.owner = req.user._id;
    const done = await Lead.find(doneFilter)
      .select("contactedAt createdAt")
      .lean();
    const avg = done.length
      ? Math.round(
          done.reduce(
            (a, l) => a + (new Date(l.contactedAt) - new Date(l.createdAt)) / 60000,
            0
          ) / done.length
        )
      : 0;

    const queue = open
      .slice()
      .sort((a, b) => {
        const fa = slaLeft(a, sla, now);
        const fb = slaLeft(b, sla, now);
        const oa = fa && fa.over ? 0 : 1;
        const ob = fb && fb.over ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return (b.score || 0) - (a.score || 0);
      })
      .slice(0, 40)
      .map((l) => ({
        ...l,
        sla: slaLeft(l, sla, now),
      }));

    return res.json({
      success: true,
      data: {
        open: open.length,
        breached,
        awaiting: unc.length,
        avgResponseMin: avg,
        queue,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

function slaLeft(l, sla, now = Date.now()) {
  if (l.contactedAt || ["won", "lost"].includes(l.status)) return null;
  const b = leadCrm.band(l);
  const target = (sla[b] || 1440) * 60000;
  const left = new Date(l.createdAt).getTime() + target - now;
  const over = left < 0;
  const a = Math.abs(left);
  const h = Math.floor(a / 3600000);
  const m = Math.floor((a % 3600000) / 60000);
  const s = Math.floor((a % 60000) / 1000);
  return {
    txt: (over ? "+" : "") + (h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`),
    over,
    cls: over ? "breach" : left < target * 0.35 ? "warn" : "ok",
    band: b,
  };
}

exports.teamStats = async (req, res) => {
  try {
    const settings = await LeadCrmSettings.getOrCreate();
    let agents = settings.agents || [];
    if (!agents.length) {
      const users = await User.find({
        active: { $ne: false },
        role: { $in: ["admin", "owner", "manager", "staff"] },
      })
        .select("_id name")
        .lean();
      agents = users.map((u) => ({
        userId: u._id,
        officeCity: "Melbourne",
        skills: ["individual_tax"],
        capacity: 8,
      }));
    }

    const userIds = agents.map((a) => a.userId);
    const users = await User.find({ _id: { $in: userIds } }).select("name email").lean();
    const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));

    const rows = [];
    for (const a of agents) {
      const uid = a.userId;
      const mine = await Lead.find({ owner: uid }).lean();
      const open = mine.filter((l) => !["won", "lost"].includes(l.status));
      const contacted = mine.filter((l) => l.contactedAt);
      const avg = contacted.length
        ? Math.round(
            contacted.reduce(
              (s, l) => s + (new Date(l.contactedAt) - new Date(l.createdAt)) / 60000,
              0
            ) / contacted.length
          )
        : null;
      const breaches = mine.filter((l) => l.escalated).length;
      const won = mine.filter((l) => l.status === "won").length;
      const lost = mine.filter((l) => l.status === "lost").length;
      const closed = won + lost;
      rows.push({
        userId: uid,
        name: byId[String(uid)]?.name || "Unknown",
        office: a.officeCity,
        capacity: a.capacity,
        skills: a.skills,
        assigned: mine.length,
        open: open.length,
        awaiting: open.filter((l) => !l.contactedAt).length,
        avg,
        breaches,
        won,
        conv: closed ? Math.round((won / closed) * 100) : null,
      });
    }

    rows.sort((a, b) => a.breaches - b.breaches || (a.avg ?? 9999) - (b.avg ?? 9999));
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.activity = async (req, res) => {
  try {
    const data = await LeadActivity.find().sort({ at: -1 }).limit(60).lean();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await LeadCrmSettings.getOrCreate();
    const users = await User.find({
      active: { $ne: false },
      role: { $in: ["admin", "owner", "manager", "staff"] },
    })
      .select("name email role office")
      .lean();
    const obj = settings.toObject();
    obj.routing =
      settings.routing instanceof Map
        ? Object.fromEntries(settings.routing)
        : obj.routing;
    return res.json({ success: true, data: { settings: obj, team: users } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await LeadCrmSettings.getOrCreate();
    const { routing, agents, automations, spend, sla } = req.body || {};
    if (routing && typeof routing === "object") {
      settings.routing = routing;
      settings.markModified("routing");
    }
    if (Array.isArray(agents)) {
      settings.agents = agents;
    }
    if (Array.isArray(automations)) {
      for (const incoming of automations) {
        const a = settings.automations.find((x) => x.id === incoming.id);
        if (a && incoming.on !== undefined) a.on = !!incoming.on;
      }
      settings.markModified("automations");
    }
    if (spend) {
      if (spend.google_ads !== undefined) settings.spend.google_ads = Number(spend.google_ads) || 0;
      if (spend.meta_ads !== undefined) settings.spend.meta_ads = Number(spend.meta_ads) || 0;
    }
    if (sla) {
      if (sla.hot) settings.sla.hot = Number(sla.hot);
      if (sla.warm) settings.sla.warm = Number(sla.warm);
      if (sla.cool) settings.sla.cool = Number(sla.cool);
    }
    await settings.save();
    const obj = settings.toObject();
    obj.routing =
      settings.routing instanceof Map
        ? Object.fromEntries(settings.routing)
        : obj.routing;
    return res.json({ success: true, data: obj });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendEmail = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    const { subject, message } = req.body || {};
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "subject and message required" });
    }
    await leadMailer.sendCustomEmail(lead, { subject, message });
    lead.log.push({
      t: `Email sent: ${subject}`,
      at: new Date(),
      by: req.user._id,
    });
    await lead.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportCsv = async (req, res) => {
  try {
    const { source, service, status, channel, minScore } = req.query;
    const filter = {};
    if (source) filter.source = source;
    if (service) filter.serviceInterest = service;
    if (status) filter.status = status;
    if (minScore) filter.score = { $gte: Number(minScore) };
    if (channel === "email") {
      filter.marketingOptin = true;
      filter["consent.email"] = true;
      filter.unsubscribed = { $ne: true };
    }
    if (channel === "sms") {
      filter.mobile = { $ne: null };
      filter["consent.sms"] = true;
    }
    if (channel === "whatsapp") {
      filter.mobile = { $ne: null };
      filter["consent.whatsapp"] = true;
    }

    const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const header = [
      "name",
      "email",
      "mobile",
      "service",
      "source",
      "article",
      "city",
      "score",
      "status",
      "email_consent",
      "whatsapp_consent",
    ];
    const rows = [header]
      .concat(
        leads.map((l) => [
          l.name || "",
          l.email,
          l.mobile || "",
          l.serviceInterest || "",
          l.source || "",
          l.articleTitle || "",
          l.city || "",
          l.score ?? "",
          l.status,
          l.consent?.email ? "yes" : "no",
          l.consent?.whatsapp ? "yes" : "no",
        ])
      )
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nanak-leads-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(rows);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.attribution = async (req, res) => {
  try {
    const settings = await LeadCrmSettings.getOrCreate();
    const sources = Object.keys(leadCrm.SRC_LABEL);
    const rows = [];
    for (const k of sources) {
      const all = await Lead.countDocuments({ source: k });
      const won = await Lead.countDocuments({ source: k, status: "won" });
      const sp =
        k === "google_ads"
          ? settings.spend?.google_ads || 0
          : k === "meta_ads"
            ? settings.spend?.meta_ads || 0
            : 0;
      rows.push({
        source: k,
        label: leadCrm.SRC_LABEL[k],
        leads: all,
        won,
        spend: sp,
        paid: k === "google_ads" || k === "meta_ads",
        conv: all ? (won / all) * 100 : 0,
        cpl: all && sp ? sp / all : null,
        cpa: won && sp ? sp / won : null,
      });
    }
    rows.sort((a, b) => b.leads - a.leads);

    const articles = await Lead.aggregate([
      { $match: { articleTitle: { $ne: null, $nin: [""] } } },
      {
        $group: {
          _id: "$articleTitle",
          n: { $sum: 1 },
          w: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
        },
      },
      { $sort: { n: -1 } },
      { $limit: 30 },
    ]);

    return res.json({
      success: true,
      data: { bySource: rows, articles, spend: settings.spend },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
