const mongoose = require("mongoose");

const ownerSchema = new mongoose.Schema(
  {
    n: { type: String, required: true, trim: true },
    verified: { type: Boolean, default: false },
    screened: { type: Boolean, default: false },
    link: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    t: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const logSchema = new mongoose.Schema(
  {
    t: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const amlMatterSchema = new mongoose.Schema(
  {
    client: { type: String, required: true, trim: true },
    svc: {
      type: String,
      enum: [
        "company_formation",
        "trust_setup",
        "smsf_setup",
        "nominee_director",
        "registered_office",
        "restructure",
      ],
      default: "company_formation",
    },
    risk: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    pep: { type: Boolean, default: false },
    owners: { type: [ownerSchema], default: [] },
    done: { type: Map, of: Boolean, default: () => new Map() },
    evidence: { type: Map, of: evidenceSchema, default: () => new Map() },
    dropbox: { type: String, trim: true, default: "" },
    commenced: { type: Boolean, default: false },
    reviewDue: { type: Date, default: null },
    notes: { type: [noteSchema], default: [] },
    log: { type: [logSchema], default: [] },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "aml_matters" }
);

amlMatterSchema.index({ client: 1, createdAt: -1 });
amlMatterSchema.index({ commenced: 1, reviewDue: 1 });
amlMatterSchema.index({ risk: 1, pep: 1 });

module.exports = mongoose.model("AmlMatter", amlMatterSchema);
