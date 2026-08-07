const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'owner', 'manager', 'staff'], default: 'staff' },
    // Legacy binary module list — kept for one release; prefer moduleAccess.
    permissions: { type: [String], default: null },
    permissionsLegacy: { type: [String], default: null },
    // Module key → none|view|edit|full (only non-none stored).
    moduleAccess: { type: mongoose.Schema.Types.Mixed, default: null },
    leadScope: { type: String, enum: ['own', 'all'], default: 'all' },
    amlOfficer: { type: Boolean, default: false },
    payrollAccess: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    avatar: { type: String, default: null },
    lastLoginAt: { type: Date, default: null },
    // Sales & Commission Hub fields
    office: { type: String, enum: ['India', 'Australia'], default: null },
    commissionEligible: { type: Boolean, default: false },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
