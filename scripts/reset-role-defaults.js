/**
 * Reset every team member's moduleAccess / leadScope to the current
 * NANAK Owner / Manager / Staff role defaults (Excel access matrix).
 *
 * Preserves amlOfficer and payrollAccess flags (designated special access).
 * Migrates legacy admin → owner.
 *
 * Usage (from nanak-accounts-backend):
 *   node scripts/reset-role-defaults.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const {
  applyRoleDefaultsToUser,
  effectiveAccess,
  normalizeTeamRole,
} = require('../src/config/modules');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected. Applying role defaults to all team members…');

  const users = await User.find({
    role: { $in: ['admin', 'owner', 'manager', 'staff'] },
  });

  let updated = 0;

  for (const user of users) {
    const beforeRole = user.role;
    applyRoleDefaultsToUser(user);
    await user.save({ validateBeforeSave: false });
    updated += 1;

    const access = effectiveAccess(user);
    const granted = Object.keys(access).filter((k) => access[k] !== 'none');

    console.log(
      `  ✓ ${user.email} role=${normalizeTeamRole(user.role)}` +
        (beforeRole !== user.role ? ` (was ${beforeRole})` : '') +
        ` leadScope=${user.leadScope}` +
        ` aml=${!!user.amlOfficer} payroll=${!!user.payrollAccess}` +
        ` modules=${granted.length}`
    );
  }

  console.log(`Done. updated=${updated}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
