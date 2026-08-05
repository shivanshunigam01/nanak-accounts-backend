/**
 * Public leads capture
 * POST /api/leads
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/leads.controller");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, try again later" },
});

router.post("/", limiter, controller.createPublic);

module.exports = router;
