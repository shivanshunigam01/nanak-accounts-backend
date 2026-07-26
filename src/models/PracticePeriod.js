const mongoose = require('mongoose');

const practicePeriodSchema = new mongoose.Schema(
  {
    periodId: { type: String, required: true, unique: true, index: true },
    financialYear: { type: String, required: true, index: true },
    kind: { type: String, enum: ['bas', 'annual'], required: true, index: true },
    quarter: { type: String, enum: ['q1', 'q2', 'q3', 'q4', null], default: null },
    label: { type: String, required: true },
    dueDate: { type: String, required: true },
    locked: { type: Boolean, default: false, index: true },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockedByName: { type: String, default: null },
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

practicePeriodSchema.index({ financialYear: 1, kind: 1, quarter: 1 }, { unique: true });

module.exports = mongoose.model('PracticePeriod', practicePeriodSchema);
