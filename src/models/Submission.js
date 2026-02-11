const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    url: { type: String, required: true },
  },
  { _id: false }
);

const activityEmbeddedSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    description: { type: String, required: true },
    doneBy: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    serviceKey: { type: String, required: true, index: true },
    serviceName: { type: String, required: true },
    customerName: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    phone: { type: String, required: true },

    formData: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
    selections: { type: mongoose.Schema.Types.Mixed, default: {} },
    packageType: { type: String, required: true },
    amount: { type: Number, required: true },

    paymentStatus: {
      type: String,
      enum: ['paid', 'pending', 'failed', 'refunded', 'pending_payment', 'payment_complete', 'payment_failed'],
      default: 'pending',
      index: true,
    },
    paymentIntentId: { type: String, default: null, index: true },
    stripeCheckoutSessionId: { type: String, default: null },

    jobStatus: { type: String, enum: ['new', 'assigned', 'in_progress', 'review', 'completed', 'failed'], default: 'new', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    notes: { type: String, default: '' },
    files: { type: [fileSchema], default: [] },
    activityLog: { type: [activityEmbeddedSchema], default: [] }
  },
  { timestamps: true }
);

submissionSchema.index({ customerName: 'text', email: 'text', orderNumber: 'text' });

module.exports = mongoose.model('Submission', submissionSchema);
