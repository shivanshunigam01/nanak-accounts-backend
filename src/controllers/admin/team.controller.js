const { body, param } = require('express-validator');
const User = require('../../models/User');
const Submission = require('../../models/Submission');
const { asyncHandler } = require('../../middleware/asyncHandler');

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
    assignedCount: countMap.get(String(u._id)) || 0,
  }));

  res.json(result);
});

const createValidators = [
  body('name').isString().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'manager', 'staff']),
  body('password').isString().isLength({ min: 6 }),
];

const createMember = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;
  const member = await User.create({ name, email, role, password, active: true });
  res.status(201).json({
    success: true,
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      role: member.role,
      active: member.active,
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
];

const updateMember = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = {};

  ['name', 'role', 'active'].forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (req.body.password) updates.password = req.body.password;

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
