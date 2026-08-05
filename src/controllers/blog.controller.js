/**
 * Public Blog Controller — list/get published posts + quiz lead capture
 */

const Blog = require("../models/blog.model");
const BlogQuizSubmission = require("../models/blog-quiz-submission.model");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Published list ──

exports.getAll = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 12 } = req.query;
    const filter = { status: "published" };

    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [total, blogs] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter)
        .select(
          "title slug excerpt coverImage category tags authorName publishedAt seoTitle seoDescription createdAt"
        )
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({
      success: true,
      data: blogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Published by slug ──

exports.getBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({
      slug: String(req.params.slug).toLowerCase(),
      status: "published",
    })
      .select("-__v")
      .lean();

    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }
    res.json({ success: true, data: blog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── Blog lead capture (free 15-min call / quiz) on blog post ──

exports.submitQuizLead = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    const blog = slug
      ? await Blog.findOne({ slug, status: "published" }).lean()
      : null;

    // Allow WordPress embeds for posts not yet in the CMS (blogId stays null)
    if (!blog && !slug) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    const body = req.body || {};
    const lead = body.lead || body;
    const touchpoint = body.touchpoint || {};
    const email = String(lead.email || "").trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: "A valid email is required" });
    }

    const mobile =
      lead.mobile != null && String(lead.mobile).trim()
        ? String(lead.mobile).trim()
        : null;
    const source =
      touchpoint.source ||
      (lead.callback_requested || lead.callbackRequested
        ? "free_15min_call"
        : "tax_check_quiz");

    // Free 15-min call requires mobile
    if (source === "free_15min_call") {
      const digits = String(mobile || "").replace(/[^\d]/g, "");
      if (digits.length < 9 || digits.length > 12) {
        return res.status(400).json({
          success: false,
          error: "A valid Australian mobile is required",
        });
      }
    }

    const callbackRequested = Boolean(
      lead.callback_requested || lead.callbackRequested || source === "free_15min_call"
    );
    const marketingOptin = Boolean(lead.marketing_optin ?? lead.marketingOptin);
    const recordType = String(lead.record_type || lead.recordType || "lead").trim();
    const consent = lead.consent || {};
    const serviceInterest = String(
      lead.service_interest || lead.serviceInterest || ""
    ).trim();
    const leadScore = Math.min(
      100,
      Math.max(0, Number(lead.lead_score ?? lead.leadScore ?? 0) || 0)
    );
    const quizAnswers = lead.quiz_answers || lead.quizAnswers || {};

    const blogId = blog?._id || null;
    const tp = {
      channel: touchpoint.channel || "blog",
      source,
      page: touchpoint.page || (blog ? `/blog/${blog.slug}` : `/${slug}`),
      articleTitle:
        touchpoint.article_title ||
        touchpoint.articleTitle ||
        blog?.title ||
        null,
      category:
        touchpoint.category ||
        blog?.category ||
        null,
      capturedAt: touchpoint.captured_at
        ? new Date(touchpoint.captured_at)
        : new Date(),
    };

    // Dual-write into unified Lead CRM
    let crmLead = null;
    try {
      const leadCrm = require("../services/lead-crm.service");
      const result = await leadCrm.capture({
        lead: {
          email,
          mobile,
          service_interest: serviceInterest,
          lead_score: leadScore,
          callback_requested: callbackRequested,
          marketing_optin: marketingOptin,
          consent,
          quiz_answers: quizAnswers,
        },
        touchpoint: {
          channel: tp.channel,
          source: source,
          page: tp.page,
          article_title: tp.articleTitle,
          captured_at: tp.capturedAt,
        },
        source: "blog_card",
      });
      crmLead = result.lead;
    } catch (e) {
      console.error("[blogs] CRM capture:", e.message);
    }

    const matchFilter = blogId
      ? { email, blogId }
      : { email, blogId: null, "touchpoint.page": tp.page };

    // Same-day open lead for same email+blog — update instead of duplicate
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let doc = await BlogQuizSubmission.findOne({
      ...matchFilter,
      createdAt: { $gte: dayAgo },
      status: { $in: ["new", "contacted"] },
    }).sort({ createdAt: -1 });

    const patch = {
      serviceInterest: serviceInterest || undefined,
      leadScore: leadScore || undefined,
      quizAnswers: Object.keys(quizAnswers).length ? quizAnswers : undefined,
      mobile: mobile || undefined,
      callbackRequested: callbackRequested || undefined,
      marketingOptin: marketingOptin || undefined,
      recordType: recordType || undefined,
      consent: Object.keys(consent).length ? consent : undefined,
      touchpoint: tp,
    };

    if (doc) {
      if (patch.serviceInterest) doc.serviceInterest = patch.serviceInterest;
      if (patch.leadScore) doc.leadScore = patch.leadScore;
      if (patch.quizAnswers) doc.quizAnswers = patch.quizAnswers;
      if (patch.mobile) doc.mobile = patch.mobile;
      if (callbackRequested) doc.callbackRequested = true;
      if (marketingOptin) doc.marketingOptin = true;
      if (patch.recordType) doc.recordType = patch.recordType;
      if (patch.consent) doc.consent = patch.consent;
      doc.touchpoint = {
        ...(doc.touchpoint?.toObject?.() || doc.touchpoint || {}),
        ...tp,
      };
      await doc.save();
      return res.status(200).json({
        success: true,
        data: doc,
        updated: true,
        leadId: crmLead?._id,
      });
    }

    doc = await BlogQuizSubmission.create({
      blogId,
      email,
      mobile,
      status: lead.status || "new",
      serviceInterest,
      leadScore,
      callbackRequested,
      marketingOptin,
      recordType,
      consent,
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
    console.error("[blogs] submitQuizLead:", err);
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
};
