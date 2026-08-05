const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    on: { type: Boolean, default: false },
    at: { type: Date, default: null },
    d: { type: String, default: "" },
  },
  { _id: false }
);

const amlFirmSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "firm" },
    enrolled: {
      type: itemSchema,
      default: () => ({ on: false, at: null, d: "AUSTRAC Reporting Entity Roll" }),
    },
    officer: {
      type: itemSchema,
      default: () => ({ on: false, at: null, d: "Compliance officer notified" }),
    },
    program: {
      type: itemSchema,
      default: () => ({
        on: false,
        at: null,
        d: "Risk assessment + policies, both parts, signed",
      }),
    },
    trainingCur: {
      type: itemSchema,
      default: () => ({ on: false, at: null, d: "All roles trained and logged this year" }),
    },
    evaluation: {
      type: itemSchema,
      default: () => ({
        on: false,
        at: null,
        d: "Independent evaluation booked (3-year clock)",
      }),
    },
    seeded: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "aml_firm_settings" }
);

amlFirmSettingsSchema.statics.getOrCreate = async function getOrCreate() {
  let doc = await this.findOne({ key: "firm" });
  if (!doc) {
    doc = await this.create({ key: "firm" });
  }
  return doc;
};

module.exports = mongoose.model("AmlFirmSettings", amlFirmSettingsSchema);
