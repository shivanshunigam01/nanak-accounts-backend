const mongoose = require("mongoose");
const { AUDIT_ACTIONS } = require("../services/firm-library.constants");

const firmLibraryAuditSchema = new mongoose.Schema(
  {
    who: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    docId: { type: mongoose.Schema.Types.ObjectId, ref: "FirmLibraryDoc", default: null },
    docName: { type: String, default: "-" },
    detail: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "firm_library_audit" }
);

firmLibraryAuditSchema.index({ createdAt: -1 });
firmLibraryAuditSchema.index({ action: 1, createdAt: -1 });
firmLibraryAuditSchema.index({ docId: 1, createdAt: -1 });

module.exports = mongoose.model("FirmLibraryAudit", firmLibraryAuditSchema);
