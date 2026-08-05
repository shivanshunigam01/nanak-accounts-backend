/**
 * Admin Newsletter Subscribers
 * GET   /api/admin/newsletter-subscribers
 * GET   /api/admin/newsletter-subscribers/:id
 * PATCH /api/admin/newsletter-subscribers/:id
 */

const express = require("express");
const { protect } = require("../../middleware/auth");
const { requireRole } = require("../../middleware/roles");
const controller = require("../../controllers/newsletter-subscribers.controller");

const router = express.Router();

router.use(protect);
router.use(requireRole("admin", "owner", "manager", "staff"));

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id", controller.update);

module.exports = router;
