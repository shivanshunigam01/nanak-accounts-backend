/**
 * Public Newsletter Subscribers
 * POST /api/newsletter-subscribers
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/newsletter-subscribers.controller");

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many submissions. Please try again later." },
});

router.post("/", submitLimiter, controller.createOrUpdate);

module.exports = router;
