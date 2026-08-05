/**
 * Newsletter subscriber — footer signup embeds (not sales leads).
 */

const mongoose = require("mongoose");

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    recordType: { type: String, default: "subscriber", trim: true },
    status: {
      type: String,
      enum: ["new", "active", "unsubscribed"],
      default: "new",
    },
    leadScore: { type: Number, min: 0, max: 100, default: 20 },
    marketingOptin: { type: Boolean, default: true },
    consent: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    touchpoint: {
      channel: { type: String, trim: true, default: "website_footer" },
      source: { type: String, trim: true, default: "newsletter_signup" },
      page: { type: String, trim: true, default: "/" },
      articleTitle: { type: String, trim: true, default: null },
      capturedAt: { type: Date, default: Date.now },
    },
    adminNotes: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    collection: "newsletter_subscribers",
  }
);

newsletterSubscriberSchema.index({ email: 1 }, { unique: true });
newsletterSubscriberSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("NewsletterSubscriber", newsletterSubscriberSchema);
