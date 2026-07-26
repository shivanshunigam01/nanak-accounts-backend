const mongoose = require('mongoose');

/** Persists payroll run status overrides (mark lodged / complete / super) keyed by client + pay date */
const practicePayrollOverrideSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeClient', required: true, index: true },
    payDate: { type: String, required: true },
    status: { type: String, enum: ['Not Started', 'In Progress', 'Completed'], default: 'Not Started' },
    stp: { type: String, enum: ['Not Lodged', 'Lodged'], default: 'Not Lodged' },
    super: { type: String, enum: ['Paid', 'Not Paid'], default: 'Not Paid' },
    employees: { type: Number, default: null },
    by: { type: String, default: null },
    on: { type: String, default: null },
  },
  { timestamps: true }
);

practicePayrollOverrideSchema.index({ clientId: 1, payDate: 1 }, { unique: true });

module.exports = mongoose.model('PracticePayrollOverride', practicePayrollOverrideSchema);
