function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  // Stripe signature errors often throw raw Error
  if (err.type === 'StripeSignatureVerificationError') {
    return res.status(400).json({ success: false, message: 'Invalid Stripe signature' });
  }

  // Mongoose validation
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: message, details: err.errors });
  }

  // Duplicate key
  if (err.code === 11000) {
    return res.status(400).json({ success: false, message: 'Duplicate key error', details: err.keyValue });
  }

  res.status(status).json({ success: false, message });
}

module.exports = { errorHandler };
