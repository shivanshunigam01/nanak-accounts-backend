const mongoose = require('mongoose');

const clientPeriodStatusSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeClient', required: true, index: true },
    periodId: { type: String, required: true, index: true },
    status: { type: String, required: true },
    lodgedOn: { type: String, default: null },
    onTime: { type: Boolean, default: null },
    feeStatus: { type: String, default: 'Not Paid' },
    invoiceNumber: { type: String, default: null },
    reconciliation: { type: mongoose.Schema.Types.Mixed, default: null },
    frozenStatus: { type: String, default: null },
    frozenFeeStatus: { type: String, default: null },
    frozenInvoiceNumber: { type: String, default: null },
  },
  { timestamps: true }
);

clientPeriodStatusSchema.index({ clientId: 1, periodId: 1 }, { unique: true });

module.exports = mongoose.model('ClientPeriodStatus', clientPeriodStatusSchema);
