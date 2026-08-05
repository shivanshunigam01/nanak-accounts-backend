/**
 * Live activity feed for Lead CRM command centre.
 */

const mongoose = require("mongoose");

const leadActivitySchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["route", "auto", "win", "warn"],
      required: true,
    },
    text: { type: String, required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    at: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
    collection: "lead_activities",
  }
);

leadActivitySchema.index({ at: -1 });

module.exports = mongoose.model("LeadActivity", leadActivitySchema);
