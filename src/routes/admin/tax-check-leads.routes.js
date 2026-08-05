/**
 * Admin Tax Check Leads
 * GET   /api/admin/tax-check-leads
 * GET   /api/admin/tax-check-leads/:id
 * PATCH /api/admin/tax-check-leads/:id
 */

const express = require("express");
const { protect } = require("../../middleware/auth");
const { requireRole } = require("../../middleware/roles");
const controller = require("../../controllers/tax-check-leads.controller");

const router = express.Router();

router.use(protect);
router.use(requireRole("admin", "owner", "manager", "staff"));

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id", controller.update);

module.exports = router;
