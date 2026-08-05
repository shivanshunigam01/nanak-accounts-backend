/**
 * Tax Check Leads — public capture + admin CRM
 * Public create now also writes to unified Lead CRM.
 */

const TaxCheckLead = require("../models/TaxCheckLead");
const leadCrm = require("../services/lead-crm.service");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizePayload(body) {
  const lead = body?.lead || body || {};
  const touchpoint = body?.touchpoint || {};
  const email = String(lead.email || "").trim().toLowerCase();
  return { lead, touchpoint, email };
}

// ── Public: create or update lead (email submit / callback) ──

exports.createOrUpdate = async (req, res) => {
  try {
    const { lead, touchpoint, email } = normalizePayload(req.body);

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    const mobile =
      lead.mobile != null && String(lead.mobile).trim()
        ? String(lead.mobile).trim()
        : null;
    const callbackRequested = Boolean(lead.callback_requested || lead.callbackRequested);
    const serviceInterest = String(
      lead.service_interest || lead.serviceInterest || ""
    ).trim();
    const leadScore = Math.min(
      100,
      Math.max(0, Number(lead.lead_score ?? lead.leadScore ?? 0) || 0)
    );
    const quizAnswers = lead.quiz_answers || lead.quizAnswers || {};

    const tp = {
      channel: touchpoint.channel || "website_footer",
      source: touchpoint.source || "tax_check_quiz",
      page: touchpoint.page || "/",
      capturedAt: touchpoint.captured_at
        ? new Date(touchpoint.captured_at)
        : new Date(),
    };

    // Lead CRM is source of truth — fail the request if CRM write fails
    let crmLead;
    try {
      const result = await leadCrm.capture({
        lead: {
          email,
          mobile,
          service_interest: serviceInterest,
          lead_score: leadScore,
          callback_requested: callbackRequested,
          quiz_answers: quizAnswers,
          consent: lead.consent,
        },
        touchpoint: {
          channel: tp.channel,
          source: tp.source,
          page: tp.page,
          article_title: touchpoint.article_title || touchpoint.articleTitle,
          captured_at: tp.capturedAt,
        },
      });
      crmLead = result.lead;
    } catch (e) {
      console.error("[tax-check-leads] CRM capture:", e.message);
      return res.status(e.status || 500).json({
        success: false,
        message: e.message || "Failed to save lead",
      });
    }

    // Keep legacy collection for backwards compatibility
    if (callbackRequested || (mobile && tp.source === "tax_check_quiz_callback")) {
      const existing = await TaxCheckLead.findOne({ email }).sort({ createdAt: -1 });
      if (existing) {
        if (mobile) existing.mobile = mobile;
        existing.callbackRequested = true;
        if (tp.source) existing.touchpoint.source = tp.source;
        await existing.save();
        return res.status(200).json({
          success: true,
          data: existing,
          updated: true,
          leadId: crmLead?._id,
        });
      }
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let doc = await TaxCheckLead.findOne({
      email,
      createdAt: { $gte: dayAgo },
      status: { $in: ["new", "contacted"] },
    }).sort({ createdAt: -1 });

    if (doc) {
      doc.serviceInterest = serviceInterest || doc.serviceInterest;
      doc.leadScore = leadScore || doc.leadScore;
      doc.quizAnswers = Object.keys(quizAnswers).length ? quizAnswers : doc.quizAnswers;
      if (mobile) doc.mobile = mobile;
      if (callbackRequested) doc.callbackRequested = true;
      doc.touchpoint = { ...doc.touchpoint?.toObject?.() || doc.touchpoint || {}, ...tp };
      await doc.save();
      return res.status(200).json({
        success: true,
        data: doc,
        updated: true,
        leadId: crmLead?._id,
      });
    }

    doc = await TaxCheckLead.create({
      email,
      mobile,
      status: lead.status || "new",
      serviceInterest,
      leadScore,
      callbackRequested,
      quizAnswers,
      touchpoint: tp,
    });

    return res.status(201).json({
      success: true,
      data: doc,
      updated: false,
      leadId: crmLead?._id,
    });
  } catch (err) {
    console.error("[tax-check-leads] createOrUpdate:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

// ── Admin list / get / update (legacy — prefer /api/admin/leads) ──

exports.list = async (req, res) => {
  try {
    const { status, callback, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (callback === "yes") filter.callbackRequested = true;
    if (callback === "no") filter.callbackRequested = false;
    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { mobile: { $regex: q, $options: "i" } },
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * lim;
    const [total, data] = await Promise.all([
      TaxCheckLead.countDocuments(filter),
      TaxCheckLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    ]);
    return res.json({
      success: true,
      data,
      pagination: { page: pageNum, limit: lim, total, pages: Math.ceil(total / lim) || 1 },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const doc = await TaxCheckLead.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await TaxCheckLead.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    const { status, adminNotes, notes } = req.body || {};
    if (status) doc.status = status;
    if (adminNotes !== undefined || notes !== undefined) {
      doc.adminNotes = adminNotes !== undefined ? adminNotes : notes;
    }
    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
