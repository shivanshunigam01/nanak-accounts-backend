/**
 * One-shot migration: permissions[] → moduleAccess object.
 *
 * Usage (from nanak-accounts-backend):
 *   node scripts/migrate-module-access.js
 *
 * Safe to re-run: skips users that already have moduleAccess.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const {
  migrateLegacyArray,
  compactModuleAccess,
  defaultsForRole,
  defaultLeadScope,
  isFullAccessRole,
} = require('../src/config/modules');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected. Migrating users…');

  const users = await User.find().select('+password');
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const hasAccess =
      user.moduleAccess &&
      typeof user.moduleAccess === 'object' &&
      !Array.isArray(user.moduleAccess) &&
      Object.keys(user.moduleAccess).length > 0;

    if (hasAccess) {
      skipped += 1;
      continue;
    }

    if (Array.isArray(user.permissions) && user.permissions.length) {
      user.permissionsLegacy = [...user.permissions];
    }

    let access;
    if (isFullAccessRole(user.role)) {
      access = defaultsForRole(user.role);
    } else if (Array.isArray(user.permissions) && user.permissions.length) {
      access = migrateLegacyArray(user.role, user.permissions);
    } else {
      access = defaultsForRole(user.role);
    }

    user.moduleAccess = compactModuleAccess(access);
    if (!user.leadScope) {
      user.leadScope = defaultLeadScope(user.role);
    }
    if (user.amlOfficer == null) user.amlOfficer = false;
    if (user.payrollAccess == null) user.payrollAccess = false;

    // Stop relying on the old array for runtime resolution.
    user.permissions = null;

    await user.save({ validateBeforeSave: false });
    migrated += 1;
    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
