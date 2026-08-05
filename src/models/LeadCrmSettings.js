/**
 * Singleton Lead CRM settings — routing, agents, automations, ad spend, SLA.
 */

const mongoose = require("mongoose");

const agentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    officeCity: { type: String, trim: true, default: "Melbourne" },
    skills: {
      type: [String],
      default: ["individual_tax"],
    },
    capacity: { type: Number, default: 8, min: 1, max: 50 },
  },
  { _id: false }
);

const automationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    on: { type: Boolean, default: true },
    ran: { type: Number, default: 0 },
  },
  { _id: false }
);

const DEFAULT_AUTOS = [
  { id: "a1", on: true, ran: 0 },
  { id: "a2", on: true, ran: 0 },
  { id: "a3", on: true, ran: 0 },
  { id: "a4", on: true, ran: 0 },
  { id: "a5", on: false, ran: 0 },
  { id: "a6", on: true, ran: 0 },
];

const leadCrmSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "default" },
    routing: {
      type: Map,
      of: String,
      default: () =>
        new Map([
          ["individual_tax", "auto"],
          ["business_tax", "auto"],
          ["business_advisory", "auto"],
          ["property_tax", "auto"],
          ["smsf", "auto"],
        ]),
    },
    agents: { type: [agentProfileSchema], default: [] },
    automations: { type: [automationSchema], default: () => [...DEFAULT_AUTOS] },
    spend: {
      google_ads: { type: Number, default: 0 },
      meta_ads: { type: Number, default: 0 },
    },
    sla: {
      hot: { type: Number, default: 30 },
      warm: { type: Number, default: 240 },
      cool: { type: Number, default: 1440 },
    },
  },
  {
    timestamps: true,
    collection: "lead_crm_settings",
  }
);

leadCrmSettingsSchema.statics.getOrCreate = async function getOrCreate() {
  let doc = await this.findOne({ key: "default" });
  if (!doc) {
    doc = await this.create({ key: "default" });
  }
  // Ensure all automation ids exist
  const ids = new Set((doc.automations || []).map((a) => a.id));
  let changed = false;
  for (const d of DEFAULT_AUTOS) {
    if (!ids.has(d.id)) {
      doc.automations.push({ ...d });
      changed = true;
    }
  }
  if (changed) await doc.save();
  return doc;
};

module.exports = mongoose.model("LeadCrmSettings", leadCrmSettingsSchema);
module.exports.DEFAULT_AUTOS = DEFAULT_AUTOS;
