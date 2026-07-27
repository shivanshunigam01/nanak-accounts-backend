const { body, param } = require('express-validator');
const User = require('../../models/User');
const Submission = require('../../models/Submission');
const { asyncHandler } = require('../../middleware/asyncHandler');
const { MODULE_KEYS, sanitizeModulePermissions, effectiveModules } = require('../../config/modules');

function sanitizePermissions(value) {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const cleaned = sanitizeModulePermissions(
    value.filter((k) => typeof k === 'string' && MODULE_KEYS.includes(k))
  );
  return cleaned.length ? cleaned : null;
}

const listTeam = asyncHandler(async (_req, res) => {
  const users = await User.find().select('-password').lean();
  const ids = users.map((u) => u._id);

  const counts = await Submission.aggregate([
    { $match: { assignedTo: { $in: ids } } },
    { $group: { _id: '$assignedTo', assignedCount: { $sum: 1 } } },
  ]);

  const countMap = new Map(counts.map((c) => [String(c._id), c.assignedCount]));

  const result = users.map((u) => ({
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    avatar: u.avatar || null,
    permissions: u.permissions && u.permissions.length ? u.permissions : null,
    modules: effectiveModules(u),
    assignedCount: countMap.get(String(u._id)) || 0,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt || null,
  }));

  res.json(result);
});

const createValidators = [
  body('name').isString().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'manager', 'staff']),
  body('password').isString().isLength({ min: 6 }),
  body('permissions').optional({ nullable: true }).isArray(),
];

const createMember = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;
  const permissions = sanitizePermissions(req.body.permissions);
  const member = await User.create({
    name,
    email,
    role,
    password,
    active: true,
    permissions: permissions === undefined ? null : permissions,
  });
  res.status(201).json({
    success: true,
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      role: member.role,
      active: member.active,
      permissions: member.permissions && member.permissions.length ? member.permissions : null,
      modules: effectiveModules(member),
      assignedCount: 0,
    },
  });
});

const updateValidators = [
  param('id').isString().notEmpty(),
  body('name').optional().isString(),
  body('role').optional().isIn(['admin', 'manager', 'staff']),
  body('active').optional().isBoolean(),
  body('password').optional().isString().isLength({ min: 6 }),
  body('permissions').optional({ nullable: true }).isArray(),
];

const updateMember = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = {};

  ['name', 'role', 'active'].forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (req.body.password) updates.password = req.body.password;
  if (req.body.permissions !== undefined) {
    const permissions = sanitizePermissions(req.body.permissions);
    if (permissions !== undefined) updates.permissions = permissions;
  }

  const member = await User.findById(id);
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

  Object.assign(member, updates);
  await member.save();

  const assignedCount = await Submission.countDocuments({ assignedTo: member._id });

  res.json({
    success: true,
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      role: member.role,
      active: member.active,
      avatar: member.avatar || null,
      permissions: member.permissions && member.permissions.length ? member.permissions : null,
      modules: effectiveModules(member),
      assignedCount,
    },
  });
});

const deleteValidators = [param('id').isString().notEmpty()];

const deleteMember = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id);
  if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

  await User.deleteOne({ _id: member._id });
  res.json({ success: true, message: 'Member removed' });
});

module.exports = {
  listTeam,
  createMember,
  updateMember,
  deleteMember,
  createValidators,
  updateValidators,
  deleteValidators,
};
