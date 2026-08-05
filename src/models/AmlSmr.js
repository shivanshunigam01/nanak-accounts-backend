const mongoose = require("mongoose");

const amlSmrSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true, trim: true },
    lodged: { type: Boolean, default: false },
    clientRef: { type: String, trim: true, default: "" },
    matterId: { type: mongoose.Schema.Types.ObjectId, ref: "AmlMatter", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    seq: { type: Number, default: 1 },
  },
  { timestamps: true, collection: "aml_smrs" }
);

amlSmrSchema.index({ createdAt: -1 });
amlSmrSchema.index({ lodged: 1 });

module.exports = mongoose.model("AmlSmr", amlSmrSchema);
