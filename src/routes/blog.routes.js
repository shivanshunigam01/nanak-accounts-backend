/**
 * Public Blog Routes
 *
 * GET  /api/blogs
 * GET  /api/blogs/:slug
 * POST /api/blogs/:slug/quiz-lead
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const blogController = require("../controllers/blog.controller");

const router = express.Router();

const quizLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many submissions. Please try again later." },
});

router.get("/", blogController.getAll);
router.get("/:slug", blogController.getBySlug);
router.post("/:slug/quiz-lead", quizLimiter, blogController.submitQuizLead);

module.exports = router;
