const mongoose = require('mongoose');

// Firm-wide Division 7A record store (mirrors the tool's local DB shape).
const div7aStoreSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'firm', unique: true, index: true },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ v: 4, seq: 1, clients: [] }),
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Div7aStore', div7aStoreSchema);
