const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const {
  submitForm,
  submitFormValidators,
  checkoutSubmit,
  createCheckoutSession,
} = require('../controllers/public.controller');
const { validate } = require('../middleware/validate');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Customer-facing submission (no auth)
router.post('/submit-form', submitFormValidators, validate, submitForm);

// Checkout flow endpoints (compatible with "API_DOCUMENTATION.md")
router.post('/checkout/submit', upload.any(), checkoutSubmit);
router.post('/create-checkout-session', createCheckoutSession);

module.exports = router;
