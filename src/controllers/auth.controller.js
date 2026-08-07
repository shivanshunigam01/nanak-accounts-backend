const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/asyncHandler');
const { serializeUserAccess, defaultLeadScope } = require('../config/modules');

function signToken(userId) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
}

function userPayload(user) {
  const access = serializeUserAccess(user);
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    avatar: user.avatar,
    lastLoginAt: user.lastLoginAt || null,
    moduleAccess: access.moduleAccess,
    modules: access.modules,
    accessLevels: access.accessLevels,
    leadScope: access.leadScope || defaultLeadScope(user.role),
    amlOfficer: access.amlOfficer,
    payrollAccess: access.payrollAccess,
    permissions: access.modules,
  };
}

const loginValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
];

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !user.active) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  const ok = await user.comparePassword(password);
  if (!ok) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  // Record last successful login for Team Management visibility.
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id);
  res.json({
    success: true,
    token,
    user: userPayload(user),
  });
});

const logout = asyncHandler(async (_req, res) => {
  // Stateless JWT: frontend simply discards token
  res.json({ success: true, message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  const payload = userPayload(req.user);
  // Frontend expects { success, user }; keep flat fields for older clients.
  res.json({ success: true, user: payload, ...payload });
});

module.exports = { login, logout, me, loginValidators };
