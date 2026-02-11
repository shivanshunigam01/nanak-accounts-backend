function notFound(req, res) {
  res.status(404).json({ success: false, message: `Not Found - ${req.originalUrl}` });
}

module.exports = { notFound };
