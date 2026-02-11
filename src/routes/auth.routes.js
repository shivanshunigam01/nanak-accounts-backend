const router = require('express').Router();
const { login, logout, me, loginValidators } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.post('/login', loginValidators, validate, login);
router.post('/logout', protect, logout);
router.get('/me', protect, me);

module.exports = router;
