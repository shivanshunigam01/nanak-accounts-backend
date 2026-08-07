/**
 * Unified Lead CRM — all web + manual lead sources.
 */

const mongoose = require("mongoose");

const LEAD_SOURCES = [
  "blog",
  "blog_card",
  "popup",
  "newsletter",
  "tax_check",
  "income_tax_calculator",
  "pay_calculator",
  "google_ads",
  "meta_ads",
  "phone",
  "walk_in",
  "referral",
];

const LEAD_STATUSES = ["new", "contacted", "won", "lost"];

const SERVICES = [
  "individual_tax",
  "business_tax",
  "business_advisory",
  "property_tax",
  "smsf",
];

const leadLogSchema = new mongoose.Schema(
  {
    t: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "new",
      index: true,
    },
    score: { type: Number, min: 0, max: 100, default: 0 },
    callbackRequested: { type: Boolean, default: false },
    serviceInterest: {
      type: String,
      enum: [...SERVICES, ""],
      default: "individual_tax",
      trim: true,
    },
    source: {
      type: String,
      enum: LEAD_SOURCES,
      required: true,
      index: true,
    },
    channel: { type: String, trim: true, default: "website" },
    page: { type: String, trim: true, default: "/" },
    articleTitle: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: "" },
    marketingOptin: { type: Boolean, default: true },
    consent: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    routeWhy: { type: String, trim: true, default: "" },
    contactedAt: { type: Date, default: null },
    escalated: { type: Boolean, default: false },
    existingClient: { type: Boolean, default: false },
    log: { type: [leadLogSchema], default: [] },
    adminNotes: { type: String, trim: true, default: "" },
    quizAnswers: { type: mongoose.Schema.Types.Mixed, default: {} },
    calculatorSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    nurtureStep: { type: Number, default: 0 },
    nurtureNextAt: { type: Date, default: null },
    caseStudySentAt: { type: Date, default: null },
    winbackSentAt: { type: Date, default: null },
    unsubscribed: { type: Boolean, default: false },
    legacyRef: {
      collection: { type: String, default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  {
    timestamps: true,
    collection: "leads",
  }
);

leadSchema.index({ email: 1, createdAt: -1 });
leadSchema.index({ status: 1, contactedAt: 1 });
leadSchema.index({ owner: 1, status: 1 });
leadSchema.index({ score: -1 });
leadSchema.index({ "legacyRef.collection": 1, "legacyRef.id": 1 }, { sparse: true });
leadSchema.index({ nurtureNextAt: 1, status: 1 });

module.exports = mongoose.model("Lead", leadSchema);
module.exports.LEAD_SOURCES = LEAD_SOURCES;
module.exports.LEAD_STATUSES = LEAD_STATUSES;
module.exports.SERVICES = SERVICES;
