const mongoose = require('mongoose');

// Firm-wide CEO Command Centre workspace (mirrors the tool's saveWorkspace shape).
const commandCentreStoreSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'firm', unique: true, index: true },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CommandCentreStore', commandCentreStoreSchema);
