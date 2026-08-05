/**
 * One-time / idempotent migrate of legacy lead collections into Lead.
 */

const Lead = require("../models/Lead");
const leadCrm = require("./lead-crm.service");

async function alreadyMigrated(collection, id) {
  return Lead.exists({
    "legacyRef.collection": collection,
    "legacyRef.id": id,
  });
}

function mapOldStatus(s) {
  if (s === "won" || s === "qualified") return "won";
  if (s === "lost" || s === "closed") return "lost";
  if (s === "contacted" || s === "active") return "contacted";
  if (s === "unsubscribed") return "lost";
  return "new";
}

async function migrateTaxCheckLeads() {
  let TaxCheckLead;
  try {
    TaxCheckLead = require("../models/TaxCheckLead");
  } catch {
    return 0;
  }
  const rows = await TaxCheckLead.find().lean();
  let n = 0;
  for (const r of rows) {
    if (await alreadyMigrated("tax_check_leads", r._id)) continue;
    const source = leadCrm.mapSource({
      source: r.touchpoint?.source,
      channel: r.touchpoint?.channel,
    });
    await Lead.create({
      name: "",
      email: r.email,
      mobile: r.mobile,
      status: mapOldStatus(r.status),
      score: r.leadScore || 0,
      callbackRequested: !!r.callbackRequested,
      serviceInterest: r.serviceInterest || "individual_tax",
      source: source === "newsletter" ? "tax_check" : source,
      channel: r.touchpoint?.channel || "website_footer",
      page: r.touchpoint?.page || "/",
      articleTitle: r.touchpoint?.articleTitle || null,
      quizAnswers: r.quizAnswers || {},
      adminNotes: r.adminNotes || "",
      consent: { email: true, sms: !!r.mobile, whatsapp: false },
      log: [{ t: "Migrated from tax_check_leads", at: r.createdAt || new Date() }],
      legacyRef: { collection: "tax_check_leads", id: r._id },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      contactedAt: r.status === "contacted" || r.status === "qualified" || r.status === "closed" ? r.updatedAt : null,
    });
    n++;
  }
  return n;
}

async function migrateNewsletter() {
  let NewsletterSubscriber;
  try {
    NewsletterSubscriber = require("../models/NewsletterSubscriber");
  } catch {
    return 0;
  }
  const rows = await NewsletterSubscriber.find().lean();
  let n = 0;
  for (const r of rows) {
    if (await alreadyMigrated("newsletter_subscribers", r._id)) continue;
    await Lead.create({
      name: "",
      email: r.email,
      mobile: null,
      status: r.status === "unsubscribed" ? "lost" : mapOldStatus(r.status),
      score: r.leadScore || 20,
      callbackRequested: false,
      serviceInterest: "individual_tax",
      source: "newsletter",
      channel: r.touchpoint?.channel || "website_footer",
      page: r.touchpoint?.page || "/",
      marketingOptin: r.marketingOptin !== false,
      unsubscribed: r.status === "unsubscribed",
      consent: { email: true, sms: false, whatsapp: false },
      adminNotes: r.adminNotes || "",
      log: [{ t: "Migrated from newsletter_subscribers", at: r.createdAt || new Date() }],
      legacyRef: { collection: "newsletter_subscribers", id: r._id },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
    n++;
  }
  return n;
}

async function migrateBlogQuiz() {
  let BlogQuizSubmission;
  let Blog;
  try {
    BlogQuizSubmission = require("../models/blog-quiz-submission.model");
    Blog = require("../models/blog.model");
  } catch {
    return 0;
  }
  const rows = await BlogQuizSubmission.find().lean();
  let n = 0;
  for (const r of rows) {
    if (await alreadyMigrated("blog_quiz_submissions", r._id)) continue;
    let articleTitle = r.touchpoint?.articleTitle || null;
    if (!articleTitle && r.blogId) {
      const b = await Blog.findById(r.blogId).select("title").lean();
      if (b) articleTitle = b.title;
    }
    await Lead.create({
      name: "",
      email: r.email,
      mobile: r.mobile,
      status: mapOldStatus(r.status),
      score: r.leadScore || 0,
      callbackRequested: !!r.callbackRequested,
      serviceInterest: r.serviceInterest || "individual_tax",
      source: "blog_card",
      channel: r.touchpoint?.channel || "blog",
      page: r.touchpoint?.page || "/",
      articleTitle,
      quizAnswers: r.quizAnswers || {},
      marketingOptin: !!r.marketingOptin,
      consent: {
        email: true,
        sms: !!r.mobile,
        whatsapp: false,
      },
      adminNotes: r.adminNotes || "",
      log: [{ t: "Migrated from blog_quiz_submissions", at: r.createdAt || new Date() }],
      legacyRef: { collection: "blog_quiz_submissions", id: r._id },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      contactedAt: r.status === "contacted" || r.status === "closed" ? r.updatedAt : null,
    });
    n++;
  }
  return n;
}

let migratedOnce = false;

async function runLeadMigration() {
  if (migratedOnce) return;
  migratedOnce = true;
  try {
    const a = await migrateTaxCheckLeads();
    const b = await migrateNewsletter();
    const c = await migrateBlogQuiz();
    if (a || b || c) {
      console.log(`[lead-migrate] imported tax=${a} newsletter=${b} blog=${c}`);
    }
  } catch (e) {
    console.error("[lead-migrate] failed:", e.message);
  }
}

module.exports = { runLeadMigration };
