/**
 * Reset every team member's moduleAccess / leadScope to the current
 * NANAK Owner / Manager / Staff role defaults.
 *
 * Preserves amlOfficer and payrollAccess flags (designated special access).
 *
 * Usage (from nanak-accounts-backend):
 *   node scripts/reset-role-defaults.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const {
  normalizeIncomingAccess,
  defaultLeadScope,
  isFullAccessRole,
  effectiveAccess,
} = require('../src/config/modules');

const TARGET_EMAIL = 'blogtest@gmail.com';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected. Resetting role defaults…');

  const users = await User.find({
    role: { $in: ['admin', 'owner', 'manager', 'staff'] },
  });

  let updated = 0;
  let foundTarget = false;

  for (const user of users) {
    const amlOfficer = !!user.amlOfficer;
    const payrollAccess = !!user.payrollAccess;
    const beforeLead = user.leadScope;
    const beforeAccessKeys = user.moduleAccess
      ? Object.keys(user.moduleAccess).length
      : 0;

    if (isFullAccessRole(user.role)) {
      user.moduleAccess = null;
      user.permissions = null;
      user.leadScope = 'all';
    } else {
      user.moduleAccess = normalizeIncomingAccess(user.role, null, {
        amlOfficer,
        payrollAccess,
      });
      user.permissions = null;
      user.leadScope = defaultLeadScope(user.role);
    }

    // Keep designated special-access flags exactly as they were.
    user.amlOfficer = amlOfficer;
    user.payrollAccess = payrollAccess;

    await user.save({ validateBeforeSave: false });
    updated += 1;

    const access = effectiveAccess(user);
    const granted = Object.keys(access).filter((k) => access[k] !== 'none');
    const mark = String(user.email || '').toLowerCase() === TARGET_EMAIL ? ' ★ TARGET' : '';
    if (mark) foundTarget = true;

    console.log(
      `  ✓ ${user.email} (${user.role}) leadScope=${user.leadScope}` +
        ` aml=${amlOfficer} payroll=${payrollAccess}` +
        ` modules=${granted.length}` +
        ` (wasAccessKeys=${beforeAccessKeys}, wasLead=${beforeLead})${mark}`
    );
  }

  console.log(`Done. updated=${updated}`);
  if (foundTarget) {
    console.log(`Confirmed: ${TARGET_EMAIL} was reset to role defaults.`);
  } else {
    console.warn(`Warning: ${TARGET_EMAIL} was not found in the users collection.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
