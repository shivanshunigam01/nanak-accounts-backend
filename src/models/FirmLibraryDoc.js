const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    fname: { type: String, required: true },
    size: { type: Number, default: 0 },
    mime: { type: String, default: "application/octet-stream" },
    storageKey: { type: String, required: true },
  },
  { _id: false }
);

const versionSchema = new mongoose.Schema(
  {
    v: { type: String, required: true },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },
    file: { type: fileSchema, required: true },
  },
  { _id: false }
);

const ackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    version: { type: String, default: "v1" },
  },
  { _id: false }
);

const suggestionSchema = new mongoose.Schema(
  {
    t: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

const firmLibraryDocSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    cat: {
      type: String,
      enum: ["pol", "sop", "tpl", "prg", "trn"],
      default: "sop",
    },
    desc: { type: String, trim: true, default: "" },
    pinned: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["current", "review", "archived"],
      default: "current",
    },
    ownerName: { type: String, trim: true, default: "" },
    acks: { type: [ackSchema], default: [] },
    opens: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    file: { type: fileSchema, required: true },
    versions: { type: [versionSchema], default: [] },
    suggestions: { type: [suggestionSchema], default: [] },
    currentVersion: { type: String, default: "v1" },
  },
  { timestamps: true, collection: "firm_library_docs" }
);

firmLibraryDocSchema.index({ status: 1, pinned: -1, updatedAt: -1 });
firmLibraryDocSchema.index({ cat: 1, status: 1 });
firmLibraryDocSchema.index({ name: "text", desc: "text" });

module.exports = mongoose.model("FirmLibraryDoc", firmLibraryDocSchema);
