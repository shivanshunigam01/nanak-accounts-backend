const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/asyncHandler');

function signToken(userId) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
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

  const token = signToken(user._id);
  res.json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      avatar: user.avatar,
    },
  });
});

const logout = asyncHandler(async (_req, res) => {
  // Stateless JWT: frontend simply discards token
  res.json({ success: true, message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    active: req.user.active,
  });
});

module.exports = { login, logout, me, loginValidators };
