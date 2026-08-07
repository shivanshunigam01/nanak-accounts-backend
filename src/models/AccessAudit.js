const mongoose = require('mongoose');

const accessAuditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail: { type: String, default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetEmail: { type: String, default: null },
    action: {
      type: String,
      enum: ['access_update', 'create_member', 'flag_change', 'role_change'],
      default: 'access_update',
    },
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'access_audit' }
);

accessAuditSchema.index({ targetId: 1, createdAt: -1 });
accessAuditSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('AccessAudit', accessAuditSchema);
