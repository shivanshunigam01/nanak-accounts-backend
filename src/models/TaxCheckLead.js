/**
 * Tax Check Lead — footer quiz submissions from the website embed.
 */

const mongoose = require("mongoose");

const taxCheckLeadSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "closed"],
      default: "new",
    },
    serviceInterest: { type: String, trim: true, default: "" },
    leadScore: { type: Number, min: 0, max: 100, default: 0 },
    callbackRequested: { type: Boolean, default: false },
    quizAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    touchpoint: {
      channel: { type: String, trim: true, default: "website_footer" },
      source: { type: String, trim: true, default: "tax_check_quiz" },
      page: { type: String, trim: true, default: "/" },
      capturedAt: { type: Date, default: Date.now },
    },
    adminNotes: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    collection: "tax_check_leads",
  }
);

taxCheckLeadSchema.index({ email: 1, createdAt: -1 });
taxCheckLeadSchema.index({ status: 1, createdAt: -1 });
taxCheckLeadSchema.index({ callbackRequested: 1 });
taxCheckLeadSchema.index({ leadScore: -1 });

module.exports = mongoose.model("TaxCheckLead", taxCheckLeadSchema);
