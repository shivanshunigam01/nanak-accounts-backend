const mongoose = require("mongoose");

const amlTrainingSchema = new mongoose.Schema(
  {
    who: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true },
    status: { type: String, enum: ["scheduled", "done"], default: "scheduled" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "aml_training" }
);

module.exports = mongoose.model("AmlTraining", amlTrainingSchema);
