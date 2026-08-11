const { body, param } = require('express-validator');
const User = require('../../models/User');
const Submission = require('../../models/Submission');
const AccessAudit = require('../../models/AccessAudit');
const { asyncHandler } = require('../../middleware/asyncHandler');
const {
  serializeUserAccess,
  normalizeIncomingAccess,
  defaultLeadScope,
  isFullAccessRole,
  effectiveAccess,
  compactModuleAccess,
  normalizeTeamRole,
  applyRoleDefaultsToUser,
} = require('../../config/modules');

function memberPayload(member, assignedCount = 0) {
  const access = serializeUserAccess(member);
  return {
    _id: member._id,
    name: member.name,
    email: member.email,
    role: normalizeTeamRole(member.role),
    active: member.active,
    avatar: member.avatar || null,
    moduleAccess: access.moduleAccess,
    modules: access.modules,
    accessLevels: access.accessLevels,
    leadScope: access.leadScope,
    amlOfficer: access.amlOfficer,
    payrollAccess: access.payrollAccess,
    // Legacy field for older clients — list of granted module keys.
    permissions: access.modules,
    assignedCount,
    lastLoginAt: member.lastLoginAt || null,
    createdAt: member.createdAt || null,
  };
}

async function writeAccessAudit(actor, target, action, changes) {
  try {
    await AccessAudit.create({
      actorId: actor?._id,
      actorEmail: actor?.email || null,
      targetId: target._id,
      targetEmail: target.email || null,
      action,
      changes,
    });
  } catch (err) {
    console.error('[access-audit]', err.message);
  }
}

function diffAccess(before, after) {
  const changes = { modules: [], flags: {}, role: null, leadScope: null };
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const oldL = (before && before[key]) || 'none';
    const newL = (after && after[key]) || 'none';
    if (oldL !== newL) changes.modules.push({ module: key, from: oldL, to: newL });
  }
  return changes;
}

const listTeam = asyncHandler(async (_req, res) => {
  const users = await User.find().select('-password').lean();
  const ids = users.map((u) => u._id);

  const counts = await Submission.aggregate([
    { $match: { assignedTo: { $in: ids } } },
    { $group: { _id: '$assignedTo', assignedCount: { $sum: 1 } } },
  ]);

  const countMap = new Map(counts.map((c) => [String(c._id), c.assignedCount]));

  const result = users.map((u) =>
    memberPayload(u, countMap.get(String(u._id)) || 0)
  );

  res.json(result);
});

const createValidators = [
  body('name').isString().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('role').customSanitizer(normalizeTeamRole).isIn(['owner', 'manager', 'staff']),
  body('password').isString().isLength({ min: 6 }),
  body('moduleAccess').optional({ nullable: true }).isObject(),
  body('permissions').optional({ nullable: true }),
  body('leadScope').optional().isIn(['own', 'all']),
  body('amlOfficer').optional().isBoolean(),
  body('payrollAccess').optional().isBoolean(),
];

const createMember = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;
  const amlOfficer = !!req.body.amlOfficer;
  const payrollAccess = !!req.body.payrollAccess;
  const leadScope =
    req.body.leadScope === 'own' || req.body.leadScope === 'all'
      ? req.body.leadScope
      : defaultLeadScope(role);

  const rawAccess =
    req.body.moduleAccess !== undefined
      ? req.body.moduleAccess
      : req.body.permissions !== undefined
        ? req.body.permissions
        : null;

  const moduleAccess = isFullAccessRole(role)
    ? null
    : normalizeIncomingAccess(role, rawAccess, { amlOfficer, payrollAccess });

  const member = await User.create({
    name,
    email,
    role,
    password,
    active: true,
    moduleAccess,
    permissions: null,
    leadScope,
    amlOfficer,
    payrollAccess,
  });

  await writeAccessAudit(req.user, member, 'create_member', {
    role,
    leadScope,
    amlOfficer,
    payrollAccess,
    moduleAccess,
  });

  res.status(201).json({
    success: true,
    member: memberPayload(member, 0),
  });
});

const updateValidators = [
  param('id').isString().notEmpty(),
  body('name').optional().isString(),
  body('role').optional().customSanitizer(normalizeTeamRole).isIn(['owner', 'manager', 'staff']),
  body('active').optional().isBoolean(),
  body('password').optional().isString().isLength({ min: 6 }),
  body('moduleAccess').optional({ nullable: true }).isObject(),
  body('permissions').optional({ nullable: true }),
  body('leadScope').optional().isIn(['own', 'all']),
  body('amlOfficer').optional().isBoolean(),
  body('payrollAccess').optional().isBoolean(),
];

const updateMember = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const member = await User.findById(id);
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

  const beforeAccess = effectiveAccess(member);
  const beforeFlags = {
    amlOfficer: !!member.amlOfficer,
    payrollAccess: !!member.payrollAccess,
    leadScope: member.leadScope || defaultLeadScope(member.role),
    role: member.role,
  };

  if (req.body.name !== undefined) member.name = req.body.name;
  if (req.body.active !== undefined) member.active = req.body.active;
  if (req.body.password) member.password = req.body.password;

  const roleChanging = req.body.role !== undefined && req.body.role !== member.role;
  if (req.body.role !== undefined) member.role = req.body.role;

  if (req.body.amlOfficer !== undefined) member.amlOfficer = !!req.body.amlOfficer;
  if (req.body.payrollAccess !== undefined) member.payrollAccess = !!req.body.payrollAccess;
  if (req.body.leadScope === 'own' || req.body.leadScope === 'all') {
    member.leadScope = req.body.leadScope;
  } else if (roleChanging && req.body.leadScope === undefined) {
    member.leadScope = defaultLeadScope(member.role);
  }

  const accessPayload =
    req.body.moduleAccess !== undefined
      ? req.body.moduleAccess
      : req.body.permissions !== undefined
        ? req.body.permissions
        : undefined;

  if (accessPayload !== undefined || roleChanging || req.body.amlOfficer !== undefined || req.body.payrollAccess !== undefined) {
    if (isFullAccessRole(member.role)) {
      member.moduleAccess = null;
      member.permissions = null;
    } else {
      const raw =
        accessPayload !== undefined
          ? accessPayload
          : member.moduleAccess || compactModuleAccess(beforeAccess);
      member.moduleAccess = normalizeIncomingAccess(member.role, raw, {
        amlOfficer: member.amlOfficer,
        payrollAccess: member.payrollAccess,
      });
      member.permissions = null;
    }
  }

  // Turning flags off must clear related modules immediately (normalizeIncomingAccess does this).
  if (
    (req.body.amlOfficer === false || req.body.payrollAccess === false) &&
    !isFullAccessRole(member.role)
  ) {
    member.moduleAccess = normalizeIncomingAccess(
      member.role,
      member.moduleAccess || compactModuleAccess(beforeAccess),
      { amlOfficer: member.amlOfficer, payrollAccess: member.payrollAccess }
    );
  }

  await member.save();

  const afterAccess = effectiveAccess(member);
  const changes = diffAccess(beforeAccess, afterAccess);
  if (beforeFlags.role !== member.role) changes.role = { from: beforeFlags.role, to: member.role };
  if (beforeFlags.leadScope !== (member.leadScope || defaultLeadScope(member.role))) {
    changes.leadScope = {
      from: beforeFlags.leadScope,
      to: member.leadScope || defaultLeadScope(member.role),
    };
  }
  if (beforeFlags.amlOfficer !== !!member.amlOfficer) {
    changes.flags.amlOfficer = { from: beforeFlags.amlOfficer, to: !!member.amlOfficer };
  }
  if (beforeFlags.payrollAccess !== !!member.payrollAccess) {
    changes.flags.payrollAccess = { from: beforeFlags.payrollAccess, to: !!member.payrollAccess };
  }

  const action =
    Object.keys(changes.flags).length > 0
      ? 'flag_change'
      : roleChanging
        ? 'role_change'
        : 'access_update';

  if (
    changes.modules.length ||
    Object.keys(changes.flags).length ||
    changes.role ||
    changes.leadScope
  ) {
    await writeAccessAudit(req.user, member, action, changes);
  }

  const assignedCount = await Submission.countDocuments({ assignedTo: member._id });

  res.json({
    success: true,
    member: memberPayload(member, assignedCount),
  });
});

const deleteValidators = [param('id').isString().notEmpty()];

const deleteMember = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

  await User.deleteOne({ _id: member._id });
  res.json({ success: true, message: 'Member removed' });
});

/** Apply Excel role-matrix defaults to every team member (owner only). */
const applyRoleDefaults = asyncHandler(async (req, res) => {
  if (!isFullAccessRole(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Owner access required' });
  }

  const users = await User.find({
    role: { $in: ['admin', 'owner', 'manager', 'staff'] },
  });

  const members = [];
  for (const user of users) {
    const beforeRole = user.role;
    applyRoleDefaultsToUser(user);
    await user.save({ validateBeforeSave: false });
    await writeAccessAudit(req.user, user, 'apply_role_defaults', {
      role: { from: beforeRole, to: user.role },
    });
    members.push({
      email: user.email,
      role: normalizeTeamRole(user.role),
      leadScope: user.leadScope,
    });
  }

  res.json({
    success: true,
    updated: members.length,
    members,
  });
});

module.exports = {
  listTeam,
  createMember,
  updateMember,
  deleteMember,
  applyRoleDefaults,
  createValidators,
  updateValidators,
  deleteValidators,
};
