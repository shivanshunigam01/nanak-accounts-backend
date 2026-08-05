/**
 * Newsletter subscribers — public signup + admin CRM
 * Public create also writes to unified Lead CRM.
 */

const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const leadCrm = require("../services/lead-crm.service");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

exports.createOrUpdate = async (req, res) => {
  try {
    const lead = req.body?.lead || req.body || {};
    const touchpoint = req.body?.touchpoint || {};

    // Honeypot — bots fill this; humans leave it empty
    if (lead.company_website || lead.companyWebsite) {
      return res.status(200).json({ success: true, data: { ok: true } });
    }

    const email = String(lead.email || "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    const tp = {
      channel: touchpoint.channel || "website_footer",
      source: touchpoint.source || "newsletter_signup",
      page: touchpoint.page || "/",
      articleTitle: touchpoint.article_title || touchpoint.articleTitle || null,
      capturedAt: touchpoint.captured_at
        ? new Date(touchpoint.captured_at)
        : new Date(),
    };

    const consent = lead.consent || { email_marketing: "newsletter_v1" };
    const marketingOptin =
      lead.marketing_optin !== undefined
        ? Boolean(lead.marketing_optin)
        : lead.marketingOptin !== undefined
          ? Boolean(lead.marketingOptin)
          : true;

    let crmLead = null;
    try {
      const result = await leadCrm.capture({
        lead: {
          email,
          lead_score: lead.lead_score ?? lead.leadScore ?? 20,
          marketing_optin: marketingOptin,
          consent: { email: true, email_marketing: consent.email_marketing },
          service_interest: "individual_tax",
        },
        touchpoint: {
          channel: tp.channel,
          source: "newsletter_signup",
          page: tp.page,
          article_title: tp.articleTitle,
          captured_at: tp.capturedAt,
        },
        source: "newsletter",
      });
      crmLead = result.lead;
    } catch (e) {
      console.error("[newsletter] CRM capture:", e.message);
    }

    let doc = await NewsletterSubscriber.findOne({ email });
    if (doc) {
      if (doc.status === "unsubscribed") {
        doc.status = "active";
      }
      doc.marketingOptin = marketingOptin;
      doc.consent = consent;
      doc.touchpoint = { ...(doc.touchpoint?.toObject?.() || doc.touchpoint || {}), ...tp };
      doc.leadScore = Math.min(
        100,
        Math.max(0, Number(lead.lead_score ?? lead.leadScore ?? doc.leadScore) || 20)
      );
      await doc.save();
      return res.status(200).json({
        success: true,
        data: doc,
        updated: true,
        leadId: crmLead?._id,
      });
    }

    doc = await NewsletterSubscriber.create({
      email,
      recordType: lead.record_type || lead.recordType || "subscriber",
      status: "new",
      leadScore: Math.min(100, Math.max(0, Number(lead.lead_score ?? lead.leadScore ?? 20) || 20)),
      marketingOptin,
      consent,
      touchpoint: tp,
    });

    return res.status(201).json({
      success: true,
      data: doc,
      updated: false,
      leadId: crmLead?._id,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(200).json({ success: true, data: { email: req.body?.lead?.email }, updated: true });
    }
    console.error("[newsletter-subscribers] createOrUpdate:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

exports.list = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;

    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.email = { $regex: q, $options: "i" };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, data] = await Promise.all([
      NewsletterSubscriber.countDocuments(filter),
      NewsletterSubscriber.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

exports.getById = async (req, res) => {
  try {
    const doc = await NewsletterSubscriber.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Subscriber not found" });
    }
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await NewsletterSubscriber.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Subscriber not found" });
    }

    const { status, adminNotes, notes } = req.body;
    if (status) {
      const allowed = ["new", "active", "unsubscribed"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      doc.status = status;
      if (status === "unsubscribed") doc.marketingOptin = false;
      if (status === "active") doc.marketingOptin = true;
    }
    if (adminNotes !== undefined) doc.adminNotes = String(adminNotes);
    else if (notes !== undefined) doc.adminNotes = String(notes);

    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};
