const mongoose = require("mongoose");

const migrationRatesConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    activeYearKey: { type: String, default: "y2627" },
    years: { type: Object, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("MigrationRatesConfig", migrationRatesConfigSchema);
